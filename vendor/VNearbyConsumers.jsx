import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  FlatList,
  Dimensions,
  PermissionsAndroid,
  Platform
} from 'react-native'
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps'
import * as Location from 'expo-location'
import { useNavigation } from '@react-navigation/native'
import Icon from '../Icon'
import VendorService from '../services/VendorService'
import LocationService from '../services/LocationService'

const { width, height } = Dimensions.get('window')

const VNearbyConsumers = () => {
  const navigation = useNavigation()
  const [loading, setLoading] = useState(false)
  const [vendorLocation, setVendorLocation] = useState(null)
  const [consumers, setConsumers] = useState([])
  const [selectedConsumer, setSelectedConsumer] = useState(null)
  const [routeCoordinates, setRouteCoordinates] = useState([])
  const [mapRegion, setMapRegion] = useState(null)
  const [showRoutes, setShowRoutes] = useState(false)
  const [shortestPath, setShortestPath] = useState(null)
  const [totalDistance, setTotalDistance] = useState(0)
  const [demoMode, setDemoMode] = useState(false)
  const [movingConsumers, setMovingConsumers] = useState({})

  // Dijkstra's Algorithm Implementation
  const dijkstraAlgorithm = (graph, start, end) => {
    const distances = {}
    const previous = {}
    const unvisited = new Set()
    
    // Initialize distances
    Object.keys(graph).forEach(node => {
      distances[node] = node === start ? 0 : Infinity
      previous[node] = null
      unvisited.add(node)
    })
    
    while (unvisited.size > 0) {
      // Find unvisited node with minimum distance
      let current = null
      let minDistance = Infinity
      
      unvisited.forEach(node => {
        if (distances[node] < minDistance) {
          minDistance = distances[node]
          current = node
        }
      })
      
      if (current === null) break
      
      unvisited.delete(current)
      
      // Check if we reached the end
      if (current === end) break
      
      // Update distances to neighbors
      if (graph[current]) {
        Object.keys(graph[current]).forEach(neighbor => {
          if (unvisited.has(neighbor)) {
            const alt = distances[current] + graph[current][neighbor]
            if (alt < distances[neighbor]) {
              distances[neighbor] = alt
              previous[neighbor] = current
            }
          }
        })
      }
    }
    
    // Reconstruct path
    const path = []
    let current = end
    
    while (current !== null) {
      path.unshift(current)
      current = previous[current]
    }
    
    return {
      distance: distances[end],
      path: path.length > 1 ? path : []
    }
  }

  // Calculate distance between two coordinates using Haversine formula
  const calculateDistance = (coord1, coord2) => {
    const R = 6371 // Earth's radius in kilometers
    const dLat = (coord2.latitude - coord1.latitude) * Math.PI / 180
    const dLon = (coord2.longitude - coord1.longitude) * Math.PI / 180
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(coord1.latitude * Math.PI / 180) * Math.cos(coord2.latitude * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
    return R * c
  }

  // Build graph for Dijkstra's algorithm
  const buildLocationGraph = (vendorLoc, consumerLocs) => {
    const graph = {}
    const locations = [{ id: 'vendor', ...vendorLoc }, ...consumerLocs]
    
    locations.forEach(loc1 => {
      graph[loc1.id] = {}
      locations.forEach(loc2 => {
        if (loc1.id !== loc2.id) {
          const distance = calculateDistance(
            { latitude: loc1.latitude, longitude: loc1.longitude },
            { latitude: loc2.latitude, longitude: loc2.longitude }
          )
          graph[loc1.id][loc2.id] = distance
        }
      })
    })
    
    return graph
  }

  // Find optimal route using Dijkstra's algorithm
  const findOptimalRoute = (vendorLoc, consumerLocs) => {
    if (!vendorLoc || consumerLocs.length === 0) return null
    
    const graph = buildLocationGraph(vendorLoc, consumerLocs)
    let totalDist = 0
    const fullPath = ['vendor']
    const visitedConsumers = new Set()
    let currentLocation = 'vendor'
    
    // Visit each consumer using shortest path
    while (visitedConsumers.size < consumerLocs.length) {
      let nearestConsumer = null
      let shortestDistance = Infinity
      
      consumerLocs.forEach(consumer => {
        if (!visitedConsumers.has(consumer.id)) {
          const result = dijkstraAlgorithm(graph, currentLocation, consumer.id)
          if (result.distance < shortestDistance) {
            shortestDistance = result.distance
            nearestConsumer = consumer.id
          }
        }
      })
      
      if (nearestConsumer) {
        const result = dijkstraAlgorithm(graph, currentLocation, nearestConsumer)
        totalDist += result.distance
        fullPath.push(nearestConsumer)
        visitedConsumers.add(nearestConsumer)
        currentLocation = nearestConsumer
      } else {
        break
      }
    }
    
    return {
      path: fullPath,
      totalDistance: totalDist
    }
  }

  // Convert path to coordinates for map display
  const pathToCoordinates = (path, vendorLoc, consumerLocs) => {
    const coordinates = []
    const allLocations = { vendor: vendorLoc, ...Object.fromEntries(consumerLocs.map(c => [c.id, c])) }
    
    path.forEach(locationId => {
      const loc = allLocations[locationId]
      if (loc) {
        coordinates.push({
          latitude: loc.latitude,
          longitude: loc.longitude
        })
      }
    })
    
    return coordinates
  }

  // Request location permissions
  const requestLocationPermission = async () => {
    try {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: 'Location Permission',
            message: 'This app needs location permission to show nearby consumers.',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          }
        )
        return granted === PermissionsAndroid.RESULTS.GRANTED
      } else {
        const { status } = await Location.requestForegroundPermissionsAsync()
        return status === 'granted'
      }
    } catch (error) {
      console.error('Permission request error:', error)
      return false
    }
  }

  // Get current location
  const getCurrentLocation = async () => {
    try {
      const hasPermission = await requestLocationPermission()
      if (!hasPermission) {
        Alert.alert('Permission Denied', 'Location permission is required to show nearby consumers.')
        return null
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      })

      return {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude
      }
    } catch (error) {
      console.error('Error getting location:', error)
      Alert.alert('Location Error', 'Could not get current location')
      return null
    }
  }

  // Generate demo consumers with some moving
  const generateDemoConsumers = (vendorLoc) => {
    const demoData = [
      {
        id: 'consumer_0',
        name: 'Raj Kumar',
        address: 'Connaught Place, Delhi',
        latitude: vendorLoc.latitude + 0.005,
        longitude: vendorLoc.longitude + 0.003,
        orderCount: 3,
        totalValue: 5500,
        phone: '+91 9876543210',
        isMoving: false
      },
      {
        id: 'consumer_1',
        name: 'Priya Sharma',
        address: 'Karol Bagh, Delhi',
        latitude: vendorLoc.latitude - 0.004,
        longitude: vendorLoc.longitude + 0.005,
        orderCount: 2,
        totalValue: 3200,
        phone: '+91 9876543211',
        isMoving: true,
        moveSpeed: 0.0001
      },
      {
        id: 'consumer_2',
        name: 'Amit Patel',
        address: 'Rohini, Delhi',
        latitude: vendorLoc.latitude + 0.006,
        longitude: vendorLoc.longitude - 0.004,
        orderCount: 5,
        totalValue: 8900,
        phone: '+91 9876543212',
        isMoving: true,
        moveSpeed: 0.00008
      },
      {
        id: 'consumer_3',
        name: 'Sneha Gupta',
        address: 'Janakpuri, Delhi',
        latitude: vendorLoc.latitude - 0.003,
        longitude: vendorLoc.longitude - 0.006,
        orderCount: 1,
        totalValue: 1500,
        phone: '+91 9876543213',
        isMoving: false
      },
      {
        id: 'consumer_4',
        name: 'Vikram Singh',
        address: 'Dwarka, Delhi',
        latitude: vendorLoc.latitude + 0.002,
        longitude: vendorLoc.longitude + 0.007,
        orderCount: 4,
        totalValue: 6700,
        phone: '+91 9876543214',
        isMoving: true,
        moveSpeed: 0.00012
      }
    ]

    return demoData.map(consumer => ({
      ...consumer,
      distance: calculateDistance(vendorLoc, {
        latitude: consumer.latitude,
        longitude: consumer.longitude
      })
    }))
  }

  // Animate moving consumers
  useEffect(() => {
    if (!demoMode) return

    const interval = setInterval(() => {
      setConsumers(prevConsumers => 
        prevConsumers.map(consumer => {
          if (consumer.isMoving && vendorLocation) {
            // Move consumer along a circular path
            const angle = (Date.now() / 10000) * consumer.moveSpeed * 360
            const radius = 0.004
            const newLat = vendorLocation.latitude + radius * Math.sin(angle * Math.PI / 180)
            const newLng = vendorLocation.longitude + radius * Math.cos(angle * Math.PI / 180)
            
            return {
              ...consumer,
              latitude: newLat,
              longitude: newLng,
              distance: calculateDistance(vendorLocation, {
                latitude: newLat,
                longitude: newLng
              })
            }
          }
          return consumer
        })
      )
    }, 1000)

    return () => clearInterval(interval)
  }, [demoMode, vendorLocation])

  // Toggle demo mode
  const toggleDemoMode = () => {
    if (!demoMode && vendorLocation) {
      const demoConsumers = generateDemoConsumers(vendorLocation)
      setConsumers(demoConsumers)
      
      // Calculate optimal route
      const optimalRoute = findOptimalRoute(vendorLocation, demoConsumers)
      if (optimalRoute) {
        setShortestPath(optimalRoute.path)
        setTotalDistance(optimalRoute.totalDistance)
        const routeCoords = pathToCoordinates(optimalRoute.path, vendorLocation, demoConsumers)
        setRouteCoordinates(routeCoords)
      }
    } else {
      setConsumers([])
      setRouteCoordinates([])
      setShortestPath(null)
      setTotalDistance(0)
    }
    setDemoMode(!demoMode)
  }

  // Load nearby consumers with active orders
  const loadNearbyConsumers = async () => {
    try {
      setLoading(true)

      // Get vendor's current location first
      const currentLocation = await getCurrentLocation()
      const locationToUse = currentLocation || {
        latitude: 28.6139,
        longitude: 77.2090
      }
      
      setVendorLocation(locationToUse)
      setMapRegion({
        ...locationToUse,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02
      })
      
      setLoading(false)

      // Then load consumers in background
      try {
        const response = await VendorService.getNearbyConsumers(locationToUse)
        
        if (response.success && response.data.length > 0) {
          const consumersData = response.data.map((consumer, index) => ({
            id: `consumer_${consumer.id || index}`,
            name: consumer.name || `Consumer ${index + 1}`,
            address: consumer.address || 'Unknown Address',
            latitude: consumer.latitude || (locationToUse.latitude + (Math.random() - 0.5) * 0.01),
            longitude: consumer.longitude || (locationToUse.longitude + (Math.random() - 0.5) * 0.01),
            orderCount: consumer.activeOrders || Math.floor(Math.random() * 5) + 1,
            totalValue: consumer.orderValue || Math.floor(Math.random() * 10000) + 1000,
            distance: consumer.distance || calculateDistance(locationToUse, {
              latitude: consumer.latitude || (locationToUse.latitude + (Math.random() - 0.5) * 0.01),
              longitude: consumer.longitude || (locationToUse.longitude + (Math.random() - 0.5) * 0.01)
            }),
            phone: consumer.phone || '+91 9876543210',
            isMoving: false
          }))

          setConsumers(consumersData)

          // Calculate optimal route
          const optimalRoute = findOptimalRoute(locationToUse, consumersData)
          if (optimalRoute) {
            setShortestPath(optimalRoute.path)
            setTotalDistance(optimalRoute.totalDistance)
            const routeCoords = pathToCoordinates(optimalRoute.path, locationToUse, consumersData)
            setRouteCoordinates(routeCoords)
          }
        }
      } catch (error) {
        console.error('Error loading consumers from API:', error)
        // Don't set consumers here, let user use demo mode
      }
    } catch (error) {
      console.error('Error in loadNearbyConsumers:', error)
      // Set default location on error
      const defaultLocation = {
        latitude: 28.6139,
        longitude: 77.2090
      }
      setVendorLocation(defaultLocation)
      setMapRegion({
        ...defaultLocation,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02
      })
      setLoading(false)
    }
  }

  useEffect(() => {
    loadNearbyConsumers()
  }, [])

  const handleConsumerSelect = (consumer) => {
    setSelectedConsumer(consumer)
  }

  const handleCallConsumer = (phone) => {
    Alert.alert(
      'Call Consumer',
      `Do you want to call ${phone}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Call', onPress: () => {
          // In a real app, use Linking.openURL(`tel:${phone}`)
          Alert.alert('Calling...', `Dialing ${phone}`)
        }}
      ]
    )
  }

  const toggleRoutes = () => {
    setShowRoutes(!showRoutes)
  }

  const ConsumerListItem = ({ consumer }) => (
    <TouchableOpacity 
      style={[
        styles.consumerItem,
        selectedConsumer?.id === consumer.id && styles.selectedConsumerItem
      ]}
      onPress={() => handleConsumerSelect(consumer)}
    >
      <View style={styles.consumerInfo}>
        <View style={styles.consumerNameRow}>
          <Text style={styles.consumerName}>{consumer.name}</Text>
          {consumer.isMoving && (
            <View style={styles.movingBadge}>
              <Icon name="Navigation" size={10} color="white" />
              <Text style={styles.movingBadgeText}>Moving</Text>
            </View>
          )}
        </View>
        <Text style={styles.consumerAddress}>{consumer.address}</Text>
        <View style={styles.consumerStats}>
          <View style={styles.statItem}>
            <Icon name="ShoppingBag" size={12} color="#FF9800" />
            <Text style={styles.statText}>{consumer.orderCount} orders</Text>
          </View>
          <View style={styles.statItem}>
            <Icon name="MapPin" size={12} color="#2196F3" />
            <Text style={styles.statText}>{consumer.distance.toFixed(1)} km</Text>
          </View>
        </View>
      </View>
      <TouchableOpacity 
        style={styles.callButton}
        onPress={() => handleCallConsumer(consumer.phone)}
      >
        <Icon name="Phone" size={16} color="white" />
      </TouchableOpacity>
    </TouchableOpacity>
  )

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF9800" />
        <Text style={styles.loadingText}>Finding nearby consumers...</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Icon name="ArrowLeft" size={24} color="white" />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Nearby Consumers</Text>
          <Text style={styles.headerSubtitle}>
            {consumers.length} consumer{consumers.length !== 1 ? 's' : ''} {demoMode ? '(Demo)' : 'with active orders'}
          </Text>
        </View>
        <TouchableOpacity style={styles.routeButton} onPress={toggleRoutes}>
          <Icon name={showRoutes ? "EyeOff" : "Eye"} size={20} color="white" />
        </TouchableOpacity>
      </View>

      {/* Demo Mode Toggle */}
      <View style={styles.demoModeContainer}>
        <TouchableOpacity 
          style={[styles.demoButton, demoMode && styles.demoButtonActive]} 
          onPress={toggleDemoMode}
        >
          <Icon name={demoMode ? "StopCircle" : "PlayCircle"} size={18} color={demoMode ? "#F44336" : "#4CAF50"} />
          <Text style={[styles.demoButtonText, demoMode && styles.demoButtonTextActive]}>
            {demoMode ? 'Stop Demo Mode' : 'Start Demo Mode'}
          </Text>
        </TouchableOpacity>
        {demoMode && (
          <View style={styles.demoIndicator}>
            <View style={styles.demoIndicatorDot} />
            <Text style={styles.demoIndicatorText}>Live Simulation</Text>
          </View>
        )}
      </View>

      {/* Map Section */}
      <View style={styles.mapContainer}>
        {mapRegion && (
          <MapView
            provider={PROVIDER_GOOGLE}
            style={styles.map}
            region={mapRegion}
            showsUserLocation={true}
            showsMyLocationButton={true}
          >
            {/* Vendor Location Marker */}
            {vendorLocation && (
              <Marker
                coordinate={vendorLocation}
                title="Your Location"
                description="Vendor Location"
                pinColor="#FF9800"
              >
                <View style={styles.vendorMarker}>
                  <Icon name="Store" size={20} color="white" />
                </View>
              </Marker>
            )}

            {/* Consumer Markers */}
            {consumers.map((consumer) => (
              <Marker
                key={consumer.id}
                coordinate={{
                  latitude: consumer.latitude,
                  longitude: consumer.longitude
                }}
                title={consumer.name}
                description={`${consumer.orderCount} active orders${consumer.isMoving ? ' • Moving' : ''}`}
                onPress={() => handleConsumerSelect(consumer)}
              >
                <View style={[
                  styles.consumerMarker,
                  selectedConsumer?.id === consumer.id && styles.selectedMarker,
                  consumer.isMoving && styles.movingMarker
                ]}>
                  <Icon name="User" size={16} color="white" />
                  {consumer.isMoving && (
                    <View style={styles.movingIndicator} />
                  )}
                </View>
              </Marker>
            ))}

            {/* Optimal Route Polyline */}
            {showRoutes && routeCoordinates.length > 0 && (
              <Polyline
                coordinates={routeCoordinates}
                strokeColor="#4CAF50"
                strokeWidth={3}
                lineDashPattern={[5, 5]}
              />
            )}
          </MapView>
        )}

        {/* Route Info Overlay */}
        {showRoutes && shortestPath && (
          <View style={styles.routeInfoOverlay}>
            <View style={styles.routeInfo}>
              <Icon name="Route" size={16} color="#4CAF50" />
              <Text style={styles.routeText}>
                Optimal Route: {totalDistance.toFixed(1)} km
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* Consumer List */}
      <View style={styles.consumerListContainer}>
        <View style={styles.listHeader}>
          <Text style={styles.listTitle}>Consumers with Active Orders</Text>
          <TouchableOpacity style={styles.refreshButton} onPress={loadNearbyConsumers}>
            <Icon name="RefreshCw" size={16} color="#FF9800" />
          </TouchableOpacity>
        </View>
        
        <FlatList
          data={consumers}
          renderItem={({ item }) => <ConsumerListItem consumer={item} />}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
    marginTop: 10,
  },

  // Header Styles
  header: {
    backgroundColor: '#FF9800',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 8,
    padding: 8,
    marginRight: 15,
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 2,
  },
  routeButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 8,
    padding: 8,
  },

  // Demo Mode Styles
  demoModeContainer: {
    backgroundColor: 'white',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  demoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  demoButtonActive: {
    backgroundColor: '#FFEBEE',
    borderColor: '#F44336',
  },
  demoButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4CAF50',
    marginLeft: 8,
  },
  demoButtonTextActive: {
    color: '#F44336',
  },
  demoIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  demoIndicatorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#F44336',
    marginRight: 6,
  },
  demoIndicatorText: {
    fontSize: 12,
    color: '#F44336',
    fontWeight: '500',
  },

  // Map Styles
  mapContainer: {
    height: height * 0.4,
    position: 'relative',
  },
  map: {
    flex: 1,
  },
  vendorMarker: {
    backgroundColor: '#FF9800',
    borderRadius: 20,
    padding: 8,
    borderWidth: 3,
    borderColor: 'white',
  },
  consumerMarker: {
    backgroundColor: '#2196F3',
    borderRadius: 15,
    padding: 6,
    borderWidth: 2,
    borderColor: 'white',
    position: 'relative',
  },
  selectedMarker: {
    backgroundColor: '#4CAF50',
    transform: [{ scale: 1.2 }],
  },
  movingMarker: {
    backgroundColor: '#FF9800',
  },
  movingIndicator: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#F44336',
  },
  routeInfoOverlay: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
  },
  routeInfo: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  routeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginLeft: 8,
  },

  // Consumer List Styles
  consumerListContainer: {
    flex: 1,
    backgroundColor: 'white',
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  listTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  refreshButton: {
    padding: 8,
  },
  listContent: {
    padding: 20,
  },
  consumerItem: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 15,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  selectedConsumerItem: {
    borderColor: '#4CAF50',
    borderWidth: 2,
  },
  consumerInfo: {
    flex: 1,
  },
  consumerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  consumerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginRight: 8,
  },
  movingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF9800',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  movingBadgeText: {
    fontSize: 9,
    color: 'white',
    fontWeight: '600',
    marginLeft: 3,
  },
  consumerAddress: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  consumerStats: {
    flexDirection: 'row',
    gap: 15,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statText: {
    fontSize: 12,
    color: '#666',
    marginLeft: 4,
  },
  callButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 20,
    padding: 10,
  },
})

export default VNearbyConsumers
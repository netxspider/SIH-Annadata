import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Alert,
  RefreshControl,
  ActivityIndicator
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import Icon from '../Icon';
import OrderService from '../services/OrderService';

const { width } = Dimensions.get('window');

const OrderStatusBadge = ({ status }) => {
  const getStatusStyle = () => {
    switch (status.toLowerCase()) {
      case 'delivered':
        return { backgroundColor: '#E8F5E8', color: '#4CAF50' };
      case 'confirmed':
        return { backgroundColor: '#E3F2FD', color: '#2196F3' };
      case 'processing':
        return { backgroundColor: '#FFF3E0', color: '#FF9800' };
      case 'cancelled':
        return { backgroundColor: '#FFEBEE', color: '#F44336' };
      case 'pending':
        return { backgroundColor: '#F3E5F5', color: '#9C27B0' };
      default:
        return { backgroundColor: '#F5F5F5', color: '#666' };
    }
  };

  const statusStyle = getStatusStyle();

  return (
    <View style={[styles.statusBadge, { backgroundColor: statusStyle.backgroundColor }]}>
      <Text style={[styles.statusText, { color: statusStyle.color }]}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Text>
    </View>
  );
};

const OrderCard = ({ order, onPress }) => {
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', { 
      day: 'numeric', 
      month: 'short', 
      year: 'numeric' 
    });
  };

  return (
    <TouchableOpacity style={styles.orderCard} onPress={() => onPress(order)}>
      <View style={styles.orderHeader}>
        <View style={styles.orderInfo}>
          <Text style={styles.orderId}>Order #{order._id?.slice(-8) || 'N/A'}</Text>
          <Text style={styles.orderDate}>{formatDate(order.createdAt)}</Text>
        </View>
        <OrderStatusBadge status={order.status} />
      </View>

      <View style={styles.farmerInfo}>
        <View style={styles.farmerIconContainer}>
          <Icon name="User" size={20} color="#4CAF50" />
        </View>
        <View style={styles.farmerDetails}>
          <Text style={styles.farmerLabel}>Farmer</Text>
          <Text style={styles.farmerName}>{order.sellerName || 'Unknown Farmer'}</Text>
        </View>
      </View>

      <View style={styles.orderItems}>
        {order.products && order.products.length > 0 ? (
          <View style={styles.itemsList}>
            {order.products.slice(0, 3).map((item, index) => (
              <View key={index} style={styles.orderItem}>
                <View style={styles.itemIconContainer}>
                  <Icon name="Package" size={16} color="#FF9800" />
                </View>
                <View style={styles.itemInfo}>
                  <Text style={styles.itemName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.itemQuantity}>
                    {item.quantity} {item.unit || 'kg'} × ₹{item.price}
                  </Text>
                </View>
                <Text style={styles.itemTotal}>
                  ₹{(item.quantity * item.price).toFixed(2)}
                </Text>
              </View>
            ))}
            {order.products.length > 3 && (
              <Text style={styles.moreItems}>
                +{order.products.length - 3} more item(s)
              </Text>
            )}
          </View>
        ) : (
          <Text style={styles.noItems}>No items</Text>
        )}
      </View>

      <View style={styles.orderFooter}>
        <View style={styles.deliveryInfo}>
          <Icon name="MapPin" size={14} color="#666" />
          <Text style={styles.deliveryText} numberOfLines={1}>
            {order.deliveryAddress || 'No address provided'}
          </Text>
        </View>
        <View style={styles.totalContainer}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalAmount}>₹{order.totalAmount?.toFixed(2) || '0.00'}</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.viewDetailsButton} onPress={() => onPress(order)}>
        <Text style={styles.viewDetailsText}>View Details</Text>
        <Icon name="ChevronRight" size={16} color="#4CAF50" />
      </TouchableOpacity>
    </TouchableOpacity>
  );
};

const FilterTab = ({ title, count, isActive, onPress }) => (
  <TouchableOpacity
    style={[styles.filterTab, isActive && styles.activeFilterTab]}
    onPress={onPress}
  >
    <Text style={[styles.filterTabText, isActive && styles.activeFilterTabText]}>
      {title}
    </Text>
    {count > 0 && (
      <View style={styles.countBadge}>
        <Text style={styles.countText}>{count}</Text>
      </View>
    )}
  </TouchableOpacity>
);

const EmptyState = ({ status }) => (
  <View style={styles.emptyState}>
    <Icon name="ShoppingBag" size={64} color="#E0E0E0" />
    <Text style={styles.emptyTitle}>No {status === 'all' ? '' : status} Orders</Text>
    <Text style={styles.emptyMessage}>
      {status === 'all'
        ? "You haven't placed any purchase orders yet. Start buying from farmers!"
        : `You don't have any ${status.toLowerCase()} orders at the moment.`}
    </Text>
    <TouchableOpacity style={styles.shopButton}>
      <Text style={styles.shopButtonText}>Browse Farmers</Text>
    </TouchableOpacity>
  </View>
);

const VOrders = () => {
  const navigation = useNavigation();
  const [activeFilter, setActiveFilter] = useState('all');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState([]);

  // Load orders when screen focuses
  useFocusEffect(
    React.useCallback(() => {
      loadOrders();
    }, [])
  );

  // Load orders from backend
  const loadOrders = async () => {
    try {
      setLoading(true);
      const fetchedOrders = await OrderService.getMyOrders();
      
      console.log('Loaded vendor orders:', fetchedOrders);
      setOrders(fetchedOrders || []);
    } catch (error) {
      console.error('Error loading orders:', error);
      Alert.alert('Error', 'Failed to load orders. Please try again.');
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadOrders();
    setRefreshing(false);
  };

  const handleOrderPress = (order) => {
    // Navigate to order details screen
    // TODO: Create order details screen
    Alert.alert(
      'Order Details',
      `Order ID: ${order._id}\nTotal: ₹${order.totalAmount}\nStatus: ${order.status}`,
      [{ text: 'OK' }]
    );
  };

  // Filter orders based on active filter
  const getFilteredOrders = () => {
    if (activeFilter === 'all') return orders;
    return orders.filter(order => order.status.toLowerCase() === activeFilter.toLowerCase());
  };

  // Get order counts for filters
  const getOrderCounts = () => {
    return {
      all: orders.length,
      pending: orders.filter(o => o.status.toLowerCase() === 'pending').length,
      confirmed: orders.filter(o => o.status.toLowerCase() === 'confirmed').length,
      delivered: orders.filter(o => o.status.toLowerCase() === 'delivered').length,
      cancelled: orders.filter(o => o.status.toLowerCase() === 'cancelled').length,
    };
  };

  const counts = getOrderCounts();
  const filteredOrders = getFilteredOrders();

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Orders</Text>
        <Text style={styles.headerSubtitle}>
          {orders.length} order{orders.length !== 1 ? 's' : ''} placed
        </Text>
      </View>

      {/* Filters */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filtersContainer}
        contentContainerStyle={styles.filtersContent}
      >
        <FilterTab
          title="All"
          count={counts.all}
          isActive={activeFilter === 'all'}
          onPress={() => setActiveFilter('all')}
        />
        <FilterTab
          title="Pending"
          count={counts.pending}
          isActive={activeFilter === 'pending'}
          onPress={() => setActiveFilter('pending')}
        />
        <FilterTab
          title="Confirmed"
          count={counts.confirmed}
          isActive={activeFilter === 'confirmed'}
          onPress={() => setActiveFilter('confirmed')}
        />
        <FilterTab
          title="Delivered"
          count={counts.delivered}
          isActive={activeFilter === 'delivered'}
          onPress={() => setActiveFilter('delivered')}
        />
        <FilterTab
          title="Cancelled"
          count={counts.cancelled}
          isActive={activeFilter === 'cancelled'}
          onPress={() => setActiveFilter('cancelled')}
        />
      </ScrollView>

      {/* Orders List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.loadingText}>Loading orders...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.ordersList}
          contentContainerStyle={styles.ordersContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4CAF50']} />
          }
        >
          {filteredOrders.length > 0 ? (
            filteredOrders.map((order) => (
              <OrderCard key={order._id} order={order} onPress={handleOrderPress} />
            ))
          ) : (
            <EmptyState status={activeFilter} />
          )}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    backgroundColor: '#FF9800',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 20,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 5,
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
  },

  // Filters
  filtersContainer: {
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    maxHeight: 60,
  },
  filtersContent: {
    paddingHorizontal: 15,
    paddingVertical: 12,
    gap: 8,
  },
  filterTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    borderRadius: 16,
    backgroundColor: '#F5F5F5',
  },
  activeFilterTab: {
    backgroundColor: '#FF9800',
  },
  filterTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  activeFilterTabText: {
    color: 'white',
  },
  countBadge: {
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    marginLeft: 6,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  countText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#666',
  },

  // Orders List
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 14,
    color: '#666',
  },
  ordersList: {
    flex: 1,
  },
  ordersContent: {
    padding: 15,
  },

  // Order Card
  orderCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 15,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  orderInfo: {
    flex: 1,
  },
  orderId: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 2,
  },
  orderDate: {
    fontSize: 12,
    color: '#999',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },

  // Farmer Info
  farmerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  farmerIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E8F5E8',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  farmerDetails: {
    flex: 1,
  },
  farmerLabel: {
    fontSize: 11,
    color: '#999',
    marginBottom: 2,
  },
  farmerName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
  },

  // Order Items
  orderItems: {
    marginBottom: 12,
  },
  itemsList: {
    gap: 8,
  },
  orderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9F9F9',
    padding: 10,
    borderRadius: 8,
  },
  itemIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFF3E0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 2,
  },
  itemQuantity: {
    fontSize: 12,
    color: '#666',
  },
  itemTotal: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF9800',
  },
  moreItems: {
    fontSize: 12,
    color: '#4CAF50',
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 4,
  },
  noItems: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic',
  },

  // Order Footer
  orderFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  deliveryInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  deliveryText: {
    fontSize: 12,
    color: '#666',
    marginLeft: 6,
    flex: 1,
  },
  totalContainer: {
    alignItems: 'flex-end',
  },
  totalLabel: {
    fontSize: 11,
    color: '#999',
    marginBottom: 2,
  },
  totalAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#4CAF50',
  },

  // View Details Button
  viewDetailsButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 10,
    backgroundColor: '#F0F0F0',
    borderRadius: 8,
  },
  viewDetailsText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4CAF50',
    marginRight: 4,
  },

  // Empty State
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 20,
    marginBottom: 8,
  },
  emptyMessage: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  shopButton: {
    backgroundColor: '#FF9800',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  shopButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
});

export default VOrders;

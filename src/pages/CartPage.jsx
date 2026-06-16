import { useState, useMemo, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Trash2, Minus, Plus, ShoppingCart, ArrowLeft, Package, Truck, CreditCard, Loader2, Smartphone,
} from 'lucide-react';
import { useBookStore } from '../context/BookStoreContext';
import { useCurrency } from '../context/CurrencyContext';
import { useUserAuth } from '../context/UserAuthContext';
import { useToast } from '../context/ToastContext';
import {
  initiateShopMobileCheckout,
  createShopCardCheckoutSession,
  completeShopCheckout,
  verifyLencoPayment,
} from '../utils/shopCheckoutApi.js';
import {
  extractLencoPaymentStatus,
  isLencoFailedStatus,
  isLencoSuccessStatus,
} from '../utils/lencoPaymentStatus.js';
import { runLencoCardWidget } from '../utils/lencoCardPayment.js';

const shippingZones = [
  { value: 'domestic', label: 'Zambia (Domestic)' },
  { value: 'regional', label: 'Southern Africa (Regional)' },
  { value: 'international', label: 'International' },
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export default function CartPage() {
  const {
    cart, updateCartItemQty, removeFromCart, clearCart,
    cartTotal, cartItemCount, cartTotalWeight, hasPhysicalItems,
    calculateShipping, placeOrder,
  } = useBookStore();
  const { formatEventPrice, isZambia, geoLoading } = useCurrency();
  const { currentUser } = useUserAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [zone, setZone] = useState('domestic');
  const [address, setAddress] = useState({
    name: '', line1: '', line2: '', city: '', province: '', postal_code: '', country: 'Zambia', phone: '',
  });
  const [notes, setNotes] = useState('');
  const [placing, setPlacing] = useState(false);
  const [orderResult, setOrderResult] = useState(null);
  const [pendingPaymentOrder, setPendingPaymentOrder] = useState(null);
  const [error, setError] = useState('');
  const [paying, setPaying] = useState(false);
  const [paymentStep, setPaymentStep] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('mobile_money');
  const [phone, setPhone] = useState(currentUser?.phone || '');

  useEffect(() => {
    if (!geoLoading) setPaymentMethod(isZambia ? 'mobile_money' : 'card');
  }, [geoLoading, isZambia]);

  useEffect(() => {
    setPhone(currentUser?.phone || address.phone || '');
  }, [currentUser?.phone, address.phone]);

  const shipping = useMemo(() =>
    calculateShipping({ zone, totalWeight: cartTotalWeight, subtotal: cartTotal }),
    [zone, cartTotalWeight, cartTotal, calculateShipping],
  );

  const grandTotal = cartTotal + shipping.cost;
  const needsPayment = grandTotal > 0.005;

  const pollUntilPaid = async (reference) => {
    const timeoutMs = 180000;
    const intervalMs = 5000;
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      await sleep(intervalMs);
      setPaymentStep('Waiting for payment confirmation…');
      const { res, json } = await verifyLencoPayment(reference);
      const status = extractLencoPaymentStatus(json);
      if (res.ok && json?.ok && isLencoSuccessStatus(status)) return true;
      if (isLencoFailedStatus(status)) {
        throw new Error('Payment was not successful.');
      }
    }
    throw new Error('Payment confirmation timed out. If you paid, try again or contact support.');
  };

  const finishPaidOrder = async (orderId, reference) => {
    const data = await completeShopCheckout({ orderId, reference });
    clearCart();
    setPendingPaymentOrder(null);
    setOrderResult(data?.order || { id: orderId, payment_status: 'paid' });
    toast.success('Payment confirmed. Your receipt will be emailed shortly.');
  };

  const handlePayForOrder = async () => {
    const order = pendingPaymentOrder;
    if (!order?.id) return;

    setPaying(true);
    setPaymentStep('Starting checkout…');
    setError('');
    try {
      if (paymentMethod === 'mobile_money') {
        if (!phone.trim()) {
          toast.error('Enter your mobile money number.');
          return;
        }
        const checkout = await initiateShopMobileCheckout({ orderId: order.id, phone });
        const reference = checkout?.reference;
        if (!reference) throw new Error('No payment reference returned.');
        setPaymentStep('Check your phone to approve the payment.');
        await pollUntilPaid(reference);
        await finishPaidOrder(order.id, reference);
      } else {
        const session = await createShopCardCheckoutSession({ orderId: order.id });
        setPaymentStep('Complete card payment in the window…');
        const reference = await runLencoCardWidget(session);
        const { res, json } = await verifyLencoPayment(reference);
        const status = extractLencoPaymentStatus(json);
        if (!res.ok || !json?.ok || !isLencoSuccessStatus(status)) {
          throw new Error('Card payment was not confirmed.');
        }
        await finishPaidOrder(order.id, reference);
      }
    } catch (err) {
      if (err?.name !== 'AbortError') {
        const message = err?.message || 'Payment failed.';
        setError(message);
        toast.error(message);
      }
    } finally {
      setPaying(false);
      setPaymentStep('');
    }
  };

  const handlePlaceOrder = async () => {
    if (!currentUser) {
      navigate('/account/login', { state: { from: '/books/cart' } });
      return;
    }
    if (cart.length === 0) return;

    setPlacing(true);
    setError('');
    try {
      const result = await placeOrder({
        user: currentUser,
        shippingAddress: hasPhysicalItems ? address : {},
        shippingZone: zone,
        notes,
        clearCartOnSuccess: !needsPayment,
      });
      if (result.success) {
        if (needsPayment) {
          setPendingPaymentOrder(result.order);
        } else {
          setOrderResult(result.order);
          toast.success('Order placed. Your receipt will be emailed if applicable.');
        }
      } else {
        setError(result.error || 'Failed to place order.');
      }
    } catch (err) {
      setError(err?.message || 'Something went wrong.');
    } finally {
      setPlacing(false);
    }
  };

  if (pendingPaymentOrder) {
    const order = pendingPaymentOrder;
    return (
      <div className="min-h-screen bg-navy-50 flex items-center justify-center px-4 py-10">
        <div className="bg-white rounded-2xl border border-navy-100 shadow-lg p-8 max-w-md w-full">
          <h2 className="text-xl font-bold text-navy-900 mb-1 text-center">Complete payment</h2>
          <p className="text-sm text-navy-500 text-center mb-1">
            Order <span className="font-mono text-navy-700">{order.id}</span>
          </p>
          <p className="text-center text-lg font-bold text-navy-900 mb-6">
            {formatEventPrice({ price: order.total, currency: 'ZMW' })}
          </p>

          <div className="space-y-3 mb-4">
            <label className="flex items-center gap-2 text-sm text-navy-700 cursor-pointer">
              <input
                type="radio"
                name="shop-pay-method"
                checked={paymentMethod === 'mobile_money'}
                onChange={() => setPaymentMethod('mobile_money')}
                disabled={paying}
              />
              <Smartphone size={16} />
              Mobile money
            </label>
            <label className="flex items-center gap-2 text-sm text-navy-700 cursor-pointer">
              <input
                type="radio"
                name="shop-pay-method"
                checked={paymentMethod === 'card'}
                onChange={() => setPaymentMethod('card')}
                disabled={paying}
              />
              <CreditCard size={16} />
              Card
            </label>
          </div>

          {paymentMethod === 'mobile_money' && (
            <input
              type="tel"
              placeholder="Mobile money number"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={paying}
              className="w-full text-sm rounded-lg border border-navy-200 px-3 py-2 mb-4"
            />
          )}

          {paymentStep && (
            <p className="text-xs text-cyan-700 mb-3 text-center">{paymentStep}</p>
          )}
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 mb-3">{error}</div>
          )}

          <button
            type="button"
            onClick={handlePayForOrder}
            disabled={paying}
            className="w-full inline-flex items-center justify-center gap-2 bg-cyan-600 hover:bg-cyan-500 text-white px-5 py-3 rounded-xl text-sm font-medium disabled:opacity-60"
          >
            {paying ? <Loader2 size={16} className="animate-spin" /> : <CreditCard size={16} />}
            {paying ? 'Processing…' : 'Pay now'}
          </button>
          <button
            type="button"
            onClick={() => setPendingPaymentOrder(null)}
            disabled={paying}
            className="w-full mt-3 text-sm text-navy-500 hover:text-navy-700"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (orderResult) {
    return (
      <div className="min-h-screen bg-navy-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl border border-navy-100 shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <Package size={28} className="text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-navy-900 mb-2">Order Placed!</h2>
          <p className="text-sm text-navy-500 mb-1">Order ID: <span className="font-mono text-navy-700">{orderResult.id}</span></p>
          <p className="text-sm text-navy-500 mb-6">
            Total: <span className="font-semibold text-navy-800">{formatEventPrice({ price: orderResult.total, currency: 'ZMW' })}</span>
          </p>
          <p className="text-xs text-navy-400 mb-4">A receipt will be sent to your email when payment is confirmed.</p>
          <div className="flex flex-col gap-3">
            <Link to="/books" className="inline-flex items-center justify-center gap-2 bg-cyan-600 hover:bg-cyan-500 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors">
              Continue Shopping
            </Link>
            <Link to="/account/profile" className="text-sm text-cyan-600 hover:underline">
              View payment history
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (cart.length === 0) {
    return (
      <div className="min-h-screen bg-navy-50 flex flex-col items-center justify-center gap-4 px-4">
        <ShoppingCart size={48} className="text-navy-300" />
        <h2 className="text-lg font-bold text-navy-800">Your cart is empty</h2>
        <p className="text-sm text-navy-500">Browse products and add them to your cart.</p>
        <Link to="/books" className="inline-flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors">
          <ArrowLeft size={14} />
          Browse Products
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-navy-50">
      <div className="bg-white border-b border-navy-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center gap-2 text-xs text-navy-500">
            <Link to="/books" className="hover:text-cyan-600 transition-colors flex items-center gap-1">
              <ArrowLeft size={12} />
              Book Shop
            </Link>
            <span>/</span>
            <span className="text-navy-700 font-medium">Cart ({cartItemCount})</span>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-28 sm:pb-8">
        <h1 className="text-2xl font-bold text-navy-900 mb-6">Shopping Cart</h1>

        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-3">
            {cart.map((item) => {
              const lineKey = item.lineKey || item.bookId;
              const variantLine = item.variantLabel && item.variantValue
                ? `${item.variantLabel}: ${item.variantValue}`
                : '';
              return (
                <div key={lineKey} className="bg-white rounded-xl border border-navy-100 p-4 flex flex-col sm:flex-row gap-4">
                  <div className="w-16 h-20 rounded-lg overflow-hidden bg-navy-100 shrink-0">
                    {item.cover_image ? (
                      <img src={item.cover_image} alt={item.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-navy-300">
                        <Package size={20} />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-navy-800 truncate">{item.title}</h3>
                    {variantLine && (
                      <p className="text-[11px] text-cyan-700 mt-0.5">{variantLine}</p>
                    )}
                    <p className="text-xs text-navy-500 mt-0.5">
                      {formatEventPrice({ price: item.price, currency: 'ZMW' })} each
                      {item.is_digital ? ' · Digital' : ''}
                    </p>
                    <div className="flex items-center gap-3 mt-2">
                      <div className="flex items-center border border-navy-200 rounded-lg overflow-hidden">
                        <button type="button" onClick={() => updateCartItemQty(lineKey, item.quantity - 1)} className="px-2 py-1 hover:bg-navy-100 text-navy-600">
                          <Minus size={12} />
                        </button>
                        <span className="px-3 py-1 text-xs font-medium text-navy-800">{item.quantity}</span>
                        <button type="button" onClick={() => updateCartItemQty(lineKey, item.quantity + 1)} className="px-2 py-1 hover:bg-navy-100 text-navy-600">
                          <Plus size={12} />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFromCart(lineKey)}
                        className="p-1 rounded-lg hover:bg-red-50 text-navy-400 hover:text-red-600 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="text-left sm:text-right shrink-0">
                    <p className="text-sm font-semibold text-navy-800">
                      {formatEventPrice({ price: item.price * item.quantity, currency: 'ZMW' })}
                    </p>
                  </div>
                </div>
              );
            })}

            <button
              type="button"
              onClick={clearCart}
              className="text-xs text-red-500 hover:text-red-600 hover:underline mt-2"
            >
              Clear Cart
            </button>
          </div>

          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-navy-100 p-5 space-y-4">
              <h3 className="text-sm font-bold text-navy-800">Order Summary</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-navy-600">
                  <span>Subtotal ({cartItemCount} items)</span>
                  <span className="font-medium">{formatEventPrice({ price: cartTotal, currency: 'ZMW' })}</span>
                </div>
                {hasPhysicalItems && (
                  <div>
                    <label className="text-xs text-navy-500 block mb-1">Shipping Zone</label>
                    <select
                      value={zone}
                      onChange={(e) => setZone(e.target.value)}
                      className="w-full text-xs rounded-lg border border-navy-200 px-3 py-2 text-navy-700"
                    >
                      {shippingZones.map((z) => (
                        <option key={z.value} value={z.value}>{z.label}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="flex justify-between text-navy-600">
                  <span className="flex items-center gap-1">
                    <Truck size={13} />
                    Shipping
                  </span>
                  <span className="font-medium">
                    {shipping.cost === 0 ? (
                      <span className="text-green-600">{shipping.label}</span>
                    ) : (
                      formatEventPrice({ price: shipping.cost, currency: 'ZMW' })
                    )}
                  </span>
                </div>
                <div className="pt-2 border-t border-navy-100 flex justify-between font-bold text-navy-900">
                  <span>Total</span>
                  <span>{formatEventPrice({ price: grandTotal, currency: 'ZMW' })}</span>
                </div>
              </div>
            </div>

            {hasPhysicalItems && (
              <div className="bg-white rounded-xl border border-navy-100 p-5 space-y-3">
                <h3 className="text-sm font-bold text-navy-800 flex items-center gap-2">
                  <Package size={14} />
                  Shipping Address
                </h3>
                <input placeholder="Full Name" value={address.name} onChange={(e) => setAddress((p) => ({ ...p, name: e.target.value }))} className="w-full text-xs rounded-lg border border-navy-200 px-3 py-2" />
                <input placeholder="Address Line 1" value={address.line1} onChange={(e) => setAddress((p) => ({ ...p, line1: e.target.value }))} className="w-full text-xs rounded-lg border border-navy-200 px-3 py-2" />
                <input placeholder="Address Line 2 (optional)" value={address.line2} onChange={(e) => setAddress((p) => ({ ...p, line2: e.target.value }))} className="w-full text-xs rounded-lg border border-navy-200 px-3 py-2" />
                <div className="grid grid-cols-2 gap-2">
                  <input placeholder="City" value={address.city} onChange={(e) => setAddress((p) => ({ ...p, city: e.target.value }))} className="text-xs rounded-lg border border-navy-200 px-3 py-2" />
                  <input placeholder="Province" value={address.province} onChange={(e) => setAddress((p) => ({ ...p, province: e.target.value }))} className="text-xs rounded-lg border border-navy-200 px-3 py-2" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input placeholder="Postal Code" value={address.postal_code} onChange={(e) => setAddress((p) => ({ ...p, postal_code: e.target.value }))} className="text-xs rounded-lg border border-navy-200 px-3 py-2" />
                  <input placeholder="Phone" value={address.phone} onChange={(e) => setAddress((p) => ({ ...p, phone: e.target.value }))} className="text-xs rounded-lg border border-navy-200 px-3 py-2" />
                </div>
              </div>
            )}

            <div className="bg-white rounded-xl border border-navy-100 p-5">
              <label className="text-xs text-navy-500 block mb-1">Order Notes (optional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="w-full text-xs rounded-lg border border-navy-200 px-3 py-2 resize-none"
                placeholder="Special instructions…"
              />
            </div>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div>
            )}

            <button
              type="button"
              onClick={handlePlaceOrder}
              disabled={placing || cart.length === 0}
              className="hidden sm:inline-flex w-full items-center justify-center gap-2 bg-cyan-600 hover:bg-cyan-500 text-white px-5 py-3 rounded-xl text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <CreditCard size={16} />
              {placing ? 'Processing...' : currentUser ? (needsPayment ? 'Continue to payment' : 'Place Order') : 'Sign In to Order'}
            </button>
          </div>
        </div>

        <div className="sm:hidden fixed bottom-3 left-3 right-3 z-20 bg-white/95 backdrop-blur rounded-2xl border border-navy-100 p-3 shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-navy-500">Total</span>
            <span className="text-sm font-bold text-navy-900">{formatEventPrice({ price: grandTotal, currency: 'ZMW' })}</span>
          </div>
          <button
            type="button"
            onClick={handlePlaceOrder}
            disabled={placing || cart.length === 0}
            className="w-full inline-flex items-center justify-center gap-2 bg-cyan-600 hover:bg-cyan-500 text-white px-5 py-3 rounded-xl text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <CreditCard size={16} />
            {placing ? 'Processing...' : currentUser ? (needsPayment ? 'Continue to payment' : 'Place Order') : 'Sign In to Order'}
          </button>
        </div>
      </div>
    </div>
  );
}

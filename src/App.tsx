import { useState, useEffect, useRef } from 'react'
import { BrowserRouter, Routes, Route, useParams, useNavigate } from 'react-router-dom'
import './App.css'
import { supabase } from './supabaseClient'

// --- Interfaces ---
interface Partner { id: string; name: string; thai_name?: string; logo?: string; promptpay_id?: string; category_names?: string[]; }
interface Product { id: number; name: string; price: number; emoji: string; category: string; imageUrl?: string; }
interface CartItem extends Product { quantity: number; sweetness: string; }
interface Category { id: number; name: string; order_index: number; }
interface Order { id: number; partnerId: string; items: any; total: number; status: 'waiting' | 'paid' | 'preparing' | 'ready' | 'cancelled'; timestamp: string; deliveryInfo: any; }

// --- Shared Components ---
function ToastNotification({ message }: { message: string }) {
  return <div className="toast">{message}</div>;
}

// --- Customer Store Page ---
function StorePage({ allPartners }: { allPartners: Partner[] }) {
  const { partnerId } = useParams<{ partnerId: string }>();
  const partner = allPartners.find(p => p.id.toLowerCase() === partnerId?.toLowerCase());
  
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>(['All']);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [toast, setToast] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [cartAnim, setCartAnim] = useState(false);
  const [showFab, setShowFab] = useState(false);
  
  const [activeProduct, setActiveProduct] = useState<Product | null>(null);
  const [isModalClosing, setIsModalClosing] = useState(false);
  const [tempSweetness, setTempSweetness] = useState('100%');
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCartClosing, setIsCartClosing] = useState(false);
  const [isTrackingOpen, setIsTrackingOpen] = useState(false);
  const [isTrackingClosing, setIsTrackingClosing] = useState(false);

  const [checkoutStep, setCheckoutStep] = useState<'cart' | 'details' | 'payment' | 'status'>(() => {
    const saved = localStorage.getItem(`dragonz_step_${partnerId}`);
    return (saved === 'status' ? 'cart' : (saved as any)) || 'cart';
  });
  const [cart, setCart] = useState<CartItem[]>(() => {
    const saved = localStorage.getItem(`dragonz_cart_${partnerId}`);
    return saved ? JSON.parse(saved) : [];
  });
  const [deliveryInfo, setDeliveryInfo] = useState(() => {
    const saved = localStorage.getItem(`dragonz_delivery_${partnerId}`);
    return saved ? JSON.parse(saved) : { name: '', phone: '', type: 'pickup_store', payment: 'promptpay' };
  });
  const [activeOrderId, setActiveOrderId] = useState<number | null>(() => {
    const saved = localStorage.getItem(`active_order_${partnerId}`);
    return saved ? Number(saved) : null;
  });
  const [orderHistory, setOrderHistory] = useState<number[]>(() => {
    const saved = localStorage.getItem(`dragonz_history_${partnerId}`);
    try { return saved ? JSON.parse(saved) : []; } catch(e) { return []; }
  });
  const [activeOrderStatus, setActiveOrderStatus] = useState<string>('waiting');
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);

  const [paymentTimeLeft, setPaymentTimer] = useState(900);
  const [paymentData, setPaymentData] = useState({ account_name: '', promptpay_number: '0958412521' });
  const [flyingItem, setFlyingItem] = useState<{x: number, y: number, targetX: number, targetY: number, emoji: string} | null>(null);
  const toastTimeoutRef = useRef<any>(null);
  const timerRef = useRef<any>(null);

  useEffect(() => { localStorage.setItem(`dragonz_cart_${partnerId}`, JSON.stringify(cart)); }, [cart, partnerId]);
  useEffect(() => { localStorage.setItem(`dragonz_step_${partnerId}`, checkoutStep); }, [checkoutStep, partnerId]);
  useEffect(() => { localStorage.setItem(`dragonz_delivery_${partnerId}`, JSON.stringify(deliveryInfo)); }, [deliveryInfo, partnerId]);
  useEffect(() => { if (activeOrderId) localStorage.setItem(`active_order_${partnerId}`, String(activeOrderId)); }, [activeOrderId, partnerId]);
  useEffect(() => { localStorage.setItem(`dragonz_history_${partnerId}`, JSON.stringify(orderHistory)); }, [orderHistory, partnerId]);

  // 📡 Real-time Order Status Listener for Customers
  useEffect(() => {
    if (!activeOrderId) return;
    
    const fetchInitialStatus = async () => {
      const { data } = await supabase.from('orders').select('*').eq('id', activeOrderId).maybeSingle();
      if (data) {
        let orderWithParsedItems = { ...data };
        if (typeof data.items === 'string') {
          try { orderWithParsedItems.items = JSON.parse(data.items); } catch(e) { orderWithParsedItems.items = []; }
        }
        setActiveOrder(orderWithParsedItems);
        setActiveOrderStatus(data.status);
      }
    };
    fetchInitialStatus();

    const channel = supabase.channel(`order-status-${activeOrderId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${activeOrderId}` }, (payload) => {
        const newStatus = payload.new.status;
        setActiveOrderStatus(newStatus);
        if (newStatus === 'preparing') showNotification('🧑‍🍳 ร้านกำลังเริ่มทำออเดอร์ของคุณแล้ว!');
        if (newStatus === 'ready') showNotification('📦 ออเดอร์ของคุณทำเสร็จแล้ว มารับได้เลยครับ!');
      })
      .subscribe();
    return () => { channel.unsubscribe(); };
  }, [activeOrderId]);

  const showNotification = (msg: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast(msg);
    toastTimeoutRef.current = setTimeout(() => setToast(null), 3000);
  };

  const clearSession = () => {
    localStorage.removeItem(`dragonz_cart_${partnerId}`);
    localStorage.removeItem(`dragonz_step_${partnerId}`);
    localStorage.removeItem(`active_order_${partnerId}`);
    localStorage.removeItem(`dragonz_delivery_${partnerId}`);
    setCart([]); setCheckoutStep('cart'); setActiveOrderId(null); setPaymentTimer(900);
  };

  useEffect(() => {
    const fetchPaymentInfo = async () => {
      try {
        const { data, error } = await supabase.from('payment').select('*').eq('id', 'promptpay').maybeSingle();
        if (data && !error) {
          setPaymentData({ 
            account_name: data.account_name || '', 
            promptpay_number: data.promptpay_number || '0958412521' 
          });
        }
      } catch (e) { console.error("Error fetching payment info:", e); }
    };
    fetchPaymentInfo();
  }, []);

  useEffect(() => {
    if (checkoutStep === 'payment' && paymentTimeLeft > 0) {
      timerRef.current = setInterval(() => setPaymentTimer(prev => prev - 1), 1000);
    } else if (paymentTimeLeft === 0 && checkoutStep === 'payment') { clearSession(); }
    return () => clearInterval(timerRef.current);
  }, [checkoutStep, paymentTimeLeft]);

  useEffect(() => {
    const handleScroll = () => setShowFab(window.scrollY > 100);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 768);
    checkMobile(); window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    async function fetchData() {
      if (!partnerId) return;
      setLoading(true);
      try {
        // 1. Fetch ALL products (no longer filtered by partnerIds)
        const { data: prodData } = await supabase.from('products').select('*').order('id', { ascending: true });
        const currentProducts = prodData || [];
        setProducts(currentProducts);

        // 2. Fetch all categories
        const { data: catData } = await supabase.from('categories').select('name').order('order_index', { ascending: true });
        
        if (catData) {
          // 3. Determine which categories to show
          const selectedByAdmin = partner?.category_names || [];
          
          let filtered;
          if (selectedByAdmin.length > 0) {
            // If admin explicitly chose categories, use those
            filtered = catData.filter(c => selectedByAdmin.includes(c.name));
          } else {
            // SMART FALLBACK: Only show categories that actually have products in this store
            const availableCatNames = [...new Set(currentProducts.map(p => p.category))];
            filtered = catData.filter(c => availableCatNames.includes(c.name));
          }
          
          setCategories(['All', ...filtered.map(c => c.name)]);
        }
      } catch (e) { console.error(e); } finally { setLoading(false); }
    }
    fetchData();
  }, [partnerId, partner]);

  const openProductModal = (product: Product) => { setActiveProduct(product); setIsModalClosing(false); setTempSweetness('100%'); };
  const closeProductModal = () => { setIsModalClosing(true); setTimeout(() => { setActiveProduct(null); setIsModalClosing(false); }, 300); };
  const openCart = () => { setIsCartOpen(true); setIsCartClosing(false); };
  const closeCart = () => { setIsCartClosing(true); setTimeout(() => { setIsCartOpen(false); setIsCartClosing(false); }, 400); };
  const openTracking = () => { setIsTrackingOpen(true); setIsTrackingClosing(false); };
  const closeTracking = () => { setIsTrackingClosing(true); setTimeout(() => { setIsTrackingOpen(false); setIsTrackingClosing(false); }, 400); };

  const updateQuantity = (id: number, sweetness: string, delta: number) => {
    setCart(prev => prev.map(item =>
      item.id === id && item.sweetness === sweetness ? { ...item, quantity: item.quantity + delta } : item
    ).filter(item => item.quantity > 0));
  };

  const confirmAddToCart = (e: React.MouseEvent) => {
    if (!activeProduct) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const cartBtn = document.querySelector('.cart-trigger');
    if (cartBtn) {
      const cartRect = cartBtn.getBoundingClientRect();
      setFlyingItem({ x: rect.left, y: rect.top, targetX: cartRect.left - rect.left, targetY: cartRect.top - rect.top, emoji: activeProduct.emoji });
      setTimeout(() => setFlyingItem(null), 800);
    }
    setCart(prev => {
      const exist = prev.find(i => i.id === activeProduct.id && i.sweetness === tempSweetness);
      if (exist) return prev.map(i => i === exist ? {...i, quantity: i.quantity + 1} : i);
      return [...prev, { ...activeProduct, quantity: 1, sweetness: tempSweetness }];
    });
    setCartAnim(true); setTimeout(() => setCartAnim(false), 300);
    closeProductModal(); showNotification(`เพิ่ม ${activeProduct.name} แล้ว!`);
  };

  const createPendingOrder = () => {
    if (!deliveryInfo.name || !deliveryInfo.phone) { showNotification('❌ กรุณากรอกข้อมูลให้ครบถ้วน'); return; }
    const orderId = Math.floor(Date.now() + Math.random() * 1000);
    setActiveOrderId(orderId);
    setCheckoutStep('payment');
    setPaymentTimer(900);
  };

  const handleInformPayment = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file || !activeOrderId) return;
    showNotification('⏳ กำลังบันทึกข้อมูลออเดอร์...');
    const fileExt = file.name.split('.').pop();
    const fileName = `slips/${activeOrderId}-${Date.now()}.${fileExt}`;
    try {
      await supabase.storage.from('product-images').upload(fileName, file);
      const orderData = {
        id: activeOrderId, partnerId: partnerId,
        items: cart.map(i => ({ name: i.name, quantity: i.quantity, sweetness: i.sweetness, price: i.price, imageUrl: i.imageUrl, emoji: i.emoji })),
        deliveryInfo: { ...deliveryInfo, slipUrl: fileName }, total: cartTotal, status: 'waiting', timestamp: new Date().toISOString()
      };
      const { error } = await supabase.from('orders').insert([orderData]);
      if (!error) {
        localStorage.removeItem(`dragonz_cart_${partnerId}`);
        localStorage.removeItem(`dragonz_step_${partnerId}`);
        setOrderHistory(prev => [...new Set([...prev, activeOrderId])]);
        setCart([]); setCheckoutStep('cart'); closeCart(); openTracking(); showNotification('✅ ส่งข้อมูลสำเร็จ!');
      } else { showNotification('❌ ผิดพลาด: ' + error.message); }
    } catch (e: any) { showNotification('❌ เกิดข้อผิดพลาด'); }
  };

  const cartTotal = cart.reduce((s, i) => s + (i.price * i.quantity), 0);
  const allowedCats = partner?.category_names || [];
  const filteredProducts = products.filter(p => {
    const isCategoryAllowed = allowedCats.length === 0 || allowedCats.includes(p.category);
    const matchesFilter = selectedCategory === 'All' || p.category === selectedCategory;
    return isCategoryAllowed && matchesFilter;
  });
  const formatTime = (seconds: number) => { const m = Math.floor(seconds / 60); const s = seconds % 60; return `${m}:${s < 10 ? '0' : ''}${s}`; };
  const targetPP = (partner?.promptpay_id || paymentData.promptpay_number || '0958412521').replace(/[^0-9]/g, '');

  if (!partner && !loading) return <div className="loading-screen">404 Not Found - ไม่พบร้านค้า</div>;
  if (loading) return <div className="loading-screen" style={{flexDirection: 'column', gap: '20px'}}>
      <img src="/assets/logo.png" style={{width: '100px', height: '100px', objectFit: 'contain', animation: 'dragonPulse 2s infinite'}} alt="logo" />
      <div style={{fontWeight: 800, letterSpacing: '-1px'}}>กำลังเตรียมข้อมูล...</div>
    </div>;

  return (
    <div className={`app ${isMobile ? 'mobile-view' : 'desktop-view'}`}>
      {toast && <ToastNotification message={toast} />}
      {flyingItem && <div className="flying-item" style={{ left: flyingItem.x, top: flyingItem.y, '--target-x': `${flyingItem.targetX}px`, '--target-y': `${flyingItem.targetY}px` } as any}>{flyingItem.emoji}</div>}
      
      <nav className="navbar">
        <div className="brand-title">
          <img src="/assets/logo.png" style={{width: isMobile ? '35px' : '45px', height: isMobile ? '35px' : '45px', objectFit: 'contain'}} alt="logo" />
          <div className="brand-text">Dragonz Cha</div>
        </div>
        <button className={`cart-trigger ${cartAnim ? 'cart-bump' : ''}`} onClick={openCart}>
          <span className="cart-total-badge">฿{cartTotal}</span>
          <div className="cart-count">{cart.reduce((a, b) => a + b.quantity, 0)}</div>
        </button>
      </nav>

      <header className="hero">
        <div className="hero-badge">{partner?.name} Official</div>
        <h1>{(partner?.thai_name || partner?.name || '').split(' ')[0]} <span>{(partner?.thai_name || '').split(' ')[1] || ''}</span></h1>
        <p>เครื่องดื่มพรีเมียม รสชาติระดับตำนาน ส่งตรงถึงหน้าจอคุณ</p>
      </header>

      <div className="filter-bar">
        {categories.map(cat => (
          <button key={cat} className={`filter-chip ${selectedCategory === cat ? 'active' : ''}`} onClick={() => setSelectedCategory(cat)}>{cat}</button>
        ))}
      </div>

      <main className="product-grid">
        {filteredProducts.map((product) => (
          <div key={product.id} className="product-card" onClick={() => openProductModal(product)}>
            <div className="product-tag">{product.category}</div>
            <div className="img-wrapper">{product.imageUrl ? <img src={product.imageUrl} alt={product.name} /> : <span style={{fontSize: '4rem'}}>{product.emoji}</span>}</div>
            <div className="product-info">
              <div className="product-title">{product.name}</div>
              <div className="price-container"><span className="amount">฿{product.price}</span><button className="add-button">+</button></div>
            </div>
          </div>
        ))}
      </main>

      <button className={`cart-fab ${showFab ? 'visible' : ''}`} onClick={openCart}>
        <img src="/assets/shopping.png" className="fab-img" alt="cart" />
        <div className="fab-badge">{cart.reduce((a, b) => a + b.quantity, 0)}</div>
      </button>

      {orderHistory.length > 0 && (
        <button className={`history-fab ${showFab ? 'visible' : ''}`} onClick={openTracking}>
          <img src="/assets/orders.png" className="fab-img" alt="tracking" />
        </button>
      )}
      
      {activeProduct && (
        <div className={`modal-overlay ${isModalClosing ? 'exit' : ''}`} onClick={closeProductModal}>
          <div className={`product-modal ${isModalClosing ? 'exit' : ''}`} onClick={e => e.stopPropagation()}>
            <button className="close-modal" onClick={closeProductModal}>✕</button>
            <div className="modal-img">{activeProduct.imageUrl ? <img src={activeProduct.imageUrl} alt={activeProduct.name} /> : <span>{activeProduct.emoji}</span>}</div>
            <div className="modal-details">
              <h2>{activeProduct.name}</h2><p className="modal-category">{activeProduct.category}</p>
              <div className="sweetness-selection">
                <label>เลือกระดับความหวาน</label>
                <div className="sweet-grid">
                  {['0%', '25%', '50%', '75%', '100%'].map(level => (
                    <button key={level} className={`sweet-pill ${tempSweetness === level ? 'active' : ''}`} onClick={() => setTempSweetness(level)}>
                      <span className="pill-val">{level}</span>
                      <span className="pill-lbl">{level === '0%' ? 'ไม่หวาน' : 'หวาน'}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="modal-footer"><div className="modal-price">฿{activeProduct.price}</div><button className="confirm-add-btn" onClick={confirmAddToCart}>ใส่ตะกร้า</button></div>
            </div>
          </div>
        </div>
      )}

      {isCartOpen && (
        <div className={`cart-overlay ${isCartClosing ? 'exit' : ''}`} onClick={closeCart}>
          <div className={`cart-drawer ${isCartClosing ? 'exit' : ''}`} onClick={e => e.stopPropagation()}>
            <div className="cart-header"><h2>{checkoutStep === 'cart' ? 'ตะกร้าสินค้า' : checkoutStep === 'details' ? 'ข้อมูลจัดส่ง' : 'ชำระเงิน'}</h2><button className="close-cart" onClick={closeCart}>✕</button></div>
            <div className="cart-content">
              {checkoutStep === 'cart' && (cart.length === 0 ? <div style={{textAlign:'center', marginTop:'50px', fontWeight:700, opacity:0.5}}>ตะกร้าว่างเปล่า</div> : cart.map(item => (
                <div key={`${item.id}-${item.sweetness}`} className="cart-item">
                  <div className="cart-item-img">{item.imageUrl ? <img src={item.imageUrl} alt={item.name} /> : <span>{item.emoji}</span>}</div>
                  <div className="item-details">
                    <div className="item-name">{item.name}</div>
                    <div className="item-meta">ความหวาน: {item.sweetness}</div>
                    <div className="item-bottom"><div className="item-price">฿{item.price * item.quantity}</div><div className="qty-control"><button onClick={() => updateQuantity(item.id, item.sweetness, -1)}>−</button><span>{item.quantity}</span><button onClick={() => updateQuantity(item.id, item.sweetness, 1)}>+</button></div></div>
                  </div>
                </div>
              )))}
              {checkoutStep === 'details' && (
                <div className="checkout-form">
                  <div className="form-group"><label>ชื่อผู้รับ</label><input type="text" placeholder="ชื่อ-นามสกุล" value={deliveryInfo.name} onChange={e => setDeliveryInfo({...deliveryInfo, name: e.target.value})} /></div>
                  <div className="form-group"><label>เบอร์โทรศัพท์</label><input type="tel" placeholder="08x-xxx-xxxx" value={deliveryInfo.phone} onChange={e => setDeliveryInfo({...deliveryInfo, phone: e.target.value})} /></div>
                  <div className="form-group"><label>รูปแบบการรับสินค้า</label><div className="delivery-type-grid">
                    <button className={`type-card ${deliveryInfo.type === 'pickup_main' ? 'active' : ''}`} onClick={() => setDeliveryInfo({...deliveryInfo, type: 'pickup_main'})}><span className="type-icon">🏢</span><div className="type-info"><strong>รับที่สำนักงานใหญ่</strong><small>Dragonz Cha</small></div></button>
                    <button className={`type-card ${deliveryInfo.type === 'pickup_store' ? 'active' : ''}`} onClick={() => setDeliveryInfo({...deliveryInfo, type: 'pickup_store'})}><span className="type-icon">🏪</span><div className="type-info"><strong>รับที่หน้าร้าน</strong><small>{partner?.name}</small></div></button>
                  </div></div>
                  <div className="form-group"><label>ช่องทางชำระเงิน</label><div className="payment-options"><div className="pay-opt active" style={{width: '100%', border: '2px solid var(--primary)', background: '#fff1f2', color: 'var(--primary)', borderRadius: '20px', padding: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', fontWeight: 800}}><span>📱</span> PromptPay (พร้อมเพย์)</div></div></div>
                </div>
              )}
              {checkoutStep === 'payment' && (
                <div className="payment-step">
                  <div className="timer-badge">กรุณาชำระเงินภายใน <span>{formatTime(paymentTimeLeft)}</span></div>
                  <div className="qr-container">
                    <div style={{textAlign: 'center', marginBottom: '15px'}}>
                      <div style={{fontSize: '0.8rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px'}}>ชื่อบัญชี</div>
                      <div style={{fontSize: '1.2rem', fontWeight: 800, color: 'var(--dark)'}}>{paymentData.account_name || 'Dragonz Cha'}</div>
                    </div>
                    <img src={`https://promptpay.io/${targetPP}/${cartTotal}.png`} alt="PromptPay QR" style={{width: '250px', height: '250px', display: 'block', margin: '0 auto', borderRadius: '20px', border: '8px solid white', boxShadow: '0 10px 30px rgba(0,0,0,0.1)'}} />
                    <div className="qr-label">สแกนจ่ายด้วยแอปธนาคารทุกแอป</div>
                  </div>
                  <div className="payment-details"><div className="row"><span>ยอดโอนทั้งหมด:</span><strong style={{color:'var(--primary)', fontSize:'1.4rem'}}>฿{cartTotal}</strong></div><div className="row"><span>รหัสออเดอร์:</span><strong>#{activeOrderId}</strong></div></div>
                  <div className="upload-section"><label className="upload-btn"><input type="file" accept="image/*" style={{display:'none'}} onChange={handleInformPayment} /><span>📸 อัปโหลดสลิปเพื่อยืนยัน</span></label></div>
                </div>
              )}
            </div>
            {cart.length > 0 && (
              <div className="cart-footer"><div className="cart-summary-block"><div className="summary-info"><span style={{fontWeight:700, color:'#64748b'}}>ยอดชำระทั้งหมด</span><span className="summary-value">฿{cartTotal}</span></div><div className="btn-group">
                {checkoutStep === 'cart' && <button className="checkout-button" onClick={() => setCheckoutStep('details')}>ไปที่ข้อมูลจัดส่ง</button>}
                {checkoutStep === 'details' && (<><button className="btn-back" style={{justifyContent:'center'}} onClick={() => setCheckoutStep('cart')}>ย้อนกลับ</button><button className="checkout-button" style={{flex:2}} onClick={createPendingOrder}>ชำระเงิน</button></>)}
                {checkoutStep === 'payment' && (<button className="btn-cancel" onClick={() => { setCheckoutStep('details'); }}>ยกเลิกรายการ</button>)}
              </div></div></div>
            )}
          </div>
        </div>
      )}

      {isTrackingOpen && (
        <div className={`cart-overlay ${isTrackingClosing ? 'exit' : ''}`} onClick={closeTracking}>
          <div className={`cart-drawer ${isTrackingClosing ? 'exit' : ''}`} onClick={e => e.stopPropagation()}>
            <div className="cart-header"><h2>ติดตามออเดอร์</h2><button className="close-cart" onClick={closeTracking}>✕</button></div>
            <div className="cart-content">
              <div className="status-step">
                <div className="status-hero">
                  <div className="dragon-pulse"><img src="/assets/logo.png" style={{width: '80px', height: '80px', objectFit: 'contain'}} alt="logo" /></div>
                  <div style={{display: 'inline-block', background: 'var(--slate-100)', padding: '6px 16px', borderRadius: '100px', fontWeight: 800, color: 'var(--slate-600)', marginBottom: '15px', fontSize: '0.85rem', border: '1px solid var(--border)'}}>
                    ออเดอร์ #{activeOrderId}
                  </div>
                  <h3>{activeOrderStatus === 'waiting' ? 'ส่งข้อมูลการโอนเรียบร้อย' : 
                       activeOrderStatus === 'preparing' ? 'กำลังจัดเตรียมสินค้า' : 
                       activeOrderStatus === 'ready' ? 'สินค้าทำเสร็จแล้ว!' : 'ได้รับคำสั่งซื้อแล้ว'}</h3>
                  <p>{activeOrderStatus === 'waiting' ? 'รอแอดมินตรวจสอบยอดเงินสักครู่ครับ' : 
                      activeOrderStatus === 'preparing' ? 'บาริสต้ากำลังปรุงเครื่องดื่มให้คุณอย่างพิถีพิถัน' : 
                      activeOrderStatus === 'ready' ? 'เชิญคุณลูกค้ารับสินค้าได้ที่จุดรับเลยครับ' : ''}</p>
                </div>
                
                {activeOrderStatus === 'ready' ? (
                  <div className="order-items-admin" style={{
                    background: 'var(--slate-50)', 
                    padding: '20px', 
                    borderRadius: '20px', 
                    marginTop: '20px'
                  }}>
                    <strong style={{fontSize: '0.85rem', color: 'var(--slate-500)', textTransform: 'uppercase', display: 'block', marginBottom: '15px', textAlign: 'center'}}>สรุปรายการที่คุณสั่ง:</strong>
                    <ul style={{listStyle:'none', padding:0, margin:0}}>
                      {(Array.isArray(activeOrder?.items) ? activeOrder.items : []).map((item: any, idx: number) => (
                        <li key={idx} style={{borderBottom: idx === ((Array.isArray(activeOrder?.items) ? activeOrder.items : []).length - 1) ? 'none' : '1px solid var(--border)', padding: '10px 0'}}>
                          <div style={{display: 'flex', alignItems: 'center', gap: '15px'}}>
                            <div style={{width: '45px', height: '45px', borderRadius: '10px', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'white', border: '1px solid var(--border)'}}>
                              {item.imageUrl ? <img src={item.imageUrl} alt={item.name} style={{width: '100%', height: '100%', objectFit: 'cover'}} /> : <span style={{fontSize: '1.5rem'}}>{item.emoji}</span>}
                            </div>
                            <div style={{flex: 1, fontSize: '0.95rem', fontWeight: 700, lineHeight: 1.2}}>
                              {item.name} <span style={{color: 'var(--primary)'}}>x{item.quantity}</span>
                              <div style={{fontSize: '0.8rem', color: 'var(--slate-500)', fontWeight: 500}}>หวาน {item.sweetness} • ฿{item.price}</div>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                    <div style={{marginTop: '15px', paddingTop: '15px', borderTop: '1px dashed var(--slate-200)', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                      <span style={{fontWeight: 700, color: 'var(--slate-500)'}}>ยอดรวมทั้งสิ้น</span>
                      <strong style={{color: 'var(--primary)', fontSize: '1.4rem'}}>฿{(activeOrder?.total || 0).toLocaleString()}</strong>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="status-timeline">
                      <div className="step active"><span>1</span> <div>ได้รับคำสั่งซื้อ</div></div>
                      <div className={`step ${['preparing', 'ready'].includes(activeOrderStatus) ? 'active' : ''}`}><span>2</span> <div>ตรวจสอบยอดเงิน</div></div>
                      <div className={`step ${['preparing', 'ready'].includes(activeOrderStatus) ? 'active' : ''}`}><span>3</span> <div>กำลังจัดเตรียมสินค้า</div></div>
                      <div className={`step ${activeOrderStatus === 'ready' ? 'active' : ''}`}><span>4</span> <div>สินค้าพร้อมรับ</div></div>
                    </div>
                    <div className="order-summary-status" style={{marginTop: '30px', textAlign: 'left', background: 'var(--slate-50)', padding: '20px', borderRadius: '20px'}}>
                      <div style={{fontSize: '0.85rem', fontWeight: 800, marginBottom: '15px', color: 'var(--slate-500)', textAlign: 'center'}}>ออเดอร์ล่าสุดของคุณ:</div>
                      <div style={{display: 'flex', flexDirection: 'column', gap: '12px'}}>
                        <div style={{fontWeight: 800, textAlign: 'center', color: 'var(--primary)', fontSize: '1.2rem'}}>ออเดอร์ #{activeOrderId}</div>
                      </div>
                    </div>
                  </>
                )}

                <button className="btn btn-dark" style={{width:'100%', marginTop:'30px', padding:'15px', borderRadius:'15px'}} onClick={() => { closeTracking(); clearSession(); }}>สั่งออเดอร์ใหม่</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Admin Dashboard Components ---
function ConfirmationModal({ title, msg, onConfirm, onClose, isOpen }: { title: string, msg: string, onConfirm: () => void, onClose: () => void, isOpen: boolean }) {
  return (
    <div className="confirm-modal-overlay" onClick={onClose}>
      <div className="confirm-card" onClick={e => e.stopPropagation()}>
        <div className="confirm-icon">⚠️</div>
        <h2>{title}</h2>
        <p>{msg}</p>
        <div className="confirm-footer">
          <button className="btn btn-dark" style={{justifyContent: 'center'}} onClick={onClose}>ยกเลิก</button>
          <button className="btn btn-primary" style={{justifyContent: 'center', background: 'var(--primary)', color: 'white'}} onClick={() => { onConfirm(); onClose(); }}>ยืนยัน</button>
        </div>
      </div>
    </div>
  );
}

// --- Admin Dashboard ---
function AdminDashboard() {
  const [session, setSession] = useState<any>(null);
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('dragonz_admin_tab') || 'orders');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [db, setDb] = useState<{products: Product[], partners: Partner[], categories: Category[], orders: Order[]}>({ products: [], partners: [], categories: [], orders: [] });
  const [payment, setPayment] = useState<{account_name: string, promptpay_number: string} | null>(null);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<string[]>([]);
  const [orderAlerts, setOrderAlerts] = useState<any[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [newPpName, setNewPpName] = useState('');
  const [newPpNumber, setNewPpNumber] = useState('');
  const [editingItem, setEditingItem] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{title: string, msg: string, onConfirm: () => void} | null>(null);
  
  const navigate = useNavigate();
  const notificationAudio = useRef(new Audio('/assets/alert.mp3'));

  const showConfirm = (title: string, msg: string, onConfirm: () => void) => {
    setConfirmModal({ title, msg, onConfirm });
  };
  
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 768);
    checkMobile(); window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => { localStorage.setItem('dragonz_admin_tab', activeTab); }, [activeTab]);

  const showNotification = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };
  const addLog = (msg: string) => { const time = new Date().toLocaleTimeString(); setLogs(prev => [...prev, `[${time}] ${msg}`].slice(-20)); };

  const loadData = async () => {
    addLog("โหลดข้อมูล...");
    try {
      const [prod, part, cat, ord, pay] = await Promise.all([
        supabase.from('products').select('*').order('id', { ascending: true }),
        supabase.from('partners').select('*'),
        supabase.from('categories').select('*').order('order_index', { ascending: true }),
        supabase.from('orders').select('*').order('timestamp', { ascending: false }),
        supabase.from('payment').select('*').eq('id', 'promptpay').maybeSingle()
      ]);
      
      console.log("[DEBUG] Raw orders data from Supabase:", ord.data);

      const parsedOrders = (ord.data || []).map(o => {
        if (typeof o.items === 'string') {
          try { 
            o.items = JSON.parse(o.items); 
          } catch(e) { 
            console.error(`[DEBUG] Failed to parse items for order #${o.id}:`, e);
            o.items = []; 
          }
        }
        return o;
      });
      
      console.log("[DEBUG] Parsed orders data before setting state:", parsedOrders);

      const newDb = { products: prod.data || [], partners: part.data || [], categories: cat.data || [], orders: parsedOrders };
      console.log("[DEBUG] Final DB object to be set:", newDb);

      setDb(newDb);

      if (pay.data) {
        setPayment(pay.data);
        setNewPpName(pay.data.account_name || '');
        setNewPpNumber(pay.data.promptpay_number || '');
      }
    } catch (e: any) { addLog("Error: " + e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => { setSession(session); if (!session) navigate('/login'); else loadData(); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => { setSession(session); if (!session) navigate('/login'); });
    const channel = supabase.channel('orders-realtime').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload) => {
      const order = payload.new as any;
      const partner = db.partners.find(p => p.id === order.partnerId);
      setOrderAlerts(prev => [...prev, { ...order, partnerName: partner?.name || order.partnerId }]);
      notificationAudio.current.loop = true; notificationAudio.current.play().catch(() => {});
      loadData();
    }).subscribe();
    return () => { subscription.unsubscribe(); channel.unsubscribe(); };
  }, [navigate, db.partners]);
const savePayment = async () => {
  if (!newPpName || !newPpNumber) {
    showNotification('❌ กรุณากรอกข้อมูลให้ครบถ้วน');
    return;
  }
  const payload = { 
    id: 'promptpay', 
    account_name: newPpName, 
    promptpay_number: newPpNumber.replace(/\D/g, '')
  };
  const { error } = await supabase.from('payment').upsert(payload);
  if (!error) {
    setPayment(payload);
    showNotification('✅ บันทึกข้อมูลการชำระเงินสำเร็จ');
  } else {
    showNotification('❌ บันทึกไม่สำเร็จ: ' + error.message);
  }
};

const updateStatus = async (id: number, status: string) => {
  const { error } = await supabase.from('orders').update({ status }).eq('id', id);
  if (!error) {
    showNotification('✅ อัปเดตสถานะออเดอร์สำเร็จ');
    loadData();
  } else {
    alert('❌ อัปเดตไม่สำเร็จ: ' + error.message);
  }
};

const handleDelete = async (table: string, id: any) => {
  showConfirm('ยืนยันการลบ?', `คุณต้องการลบข้อมูลนี้ออกจากตาราง ${table} ใช่หรือไม่? การดำเนินการนี้ไม่สามารถย้อนกลับได้`, async () => {
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (!error) {
      showNotification('✅ ลบข้อมูลสำเร็จ');
      loadData();
    } else {
      alert('❌ ไม่สามารถลบได้: ' + error.message);
    }
  });
};

  const handleLogout = () => {
    showConfirm('ออกจากระบบ?', 'คุณต้องการออกจากระบบจัดการใช่หรือไม่?', () => {
      supabase.auth.signOut();
    });
  };

  const openEditModal = (type: string, item: any = null) => {
    if (item) setEditingItem({ ...item, _type: type, category_names: item.category_names || [] });
    else {
      if (type === 'partners') setEditingItem({ id: 'shop-'+Math.floor(Math.random()*900000), name: '', promptpay_id: '', category_names: [], _type: type });
      else if (type === 'categories') setEditingItem({ name: '', order_index: db.categories.length + 1, _type: type });
      else setEditingItem({ name: '', price: 0, category: '', _type: type });
    }
    setIsModalOpen(true);
  };

  const saveItem = async () => {
    const { _type, ...data } = editingItem;
    try {
      // 🛑 CRITICAL: Ensure category_names is handled as an array for partners
      const payload = { ...data };
      if (_type === 'partners' && data.category_names) {
        payload.category_names = Array.isArray(data.category_names) ? data.category_names : [];
      }

      const { error } = await supabase.from(_type).upsert(payload);
      if (!error) {
        setToast('✅ บันทึกข้อมูลสำเร็จ');
        setIsModalOpen(false);
        setTimeout(loadData, 500); // Small delay for Supabase consistency
      } else {
        alert('❌ ไม่สามารถบันทึกได้: ' + error.message);
      }
    } catch (e: any) {
      alert('❌ เกิดข้อผิดพลาด: ' + e.message);
    }
  };

  if (!session) return null;

  return (
    <div className="admin-layout">
      {toast && <ToastNotification message={toast} />}
      <div id="notification-container">{orderAlerts.map(alert => (
        <div key={alert.id} className="order-alert" onClick={() => { setOrderAlerts(prev => prev.filter(a => a.id !== alert.id)); notificationAudio.current.pause(); }}>
          <div className="close-alert">✕</div>
          <div style={{display: 'flex', gap: '15px', alignItems: 'center'}}>
            <div style={{width: '50px', height: '50px', borderRadius: '12px', background: 'var(--slate-50)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0, border: '1px solid var(--slate-100)'}}>
              {alert.items?.[0]?.imageUrl ? <img src={alert.items[0].imageUrl} style={{width:'100%', height:'100%', objectFit:'cover'}} /> : <span style={{fontSize:'1.5rem'}}>{alert.items?.[0]?.emoji || '🔔'}</span>}
            </div>
            <div style={{flex: 1}}>
              <h4 style={{margin: 0}}>ออเดอร์ใหม่!</h4>
              <p style={{fontSize: '0.8rem', margin: '2px 0'}}>#{alert.id} จาก: <strong>{alert.partnerName}</strong></p>
              <p style={{fontWeight:800, color:'var(--primary)', fontSize: '0.9rem'}}>ยอด: ฿{alert.total}</p>
            </div>
          </div>
          <div className="timer-bar-container"><div className="timer-bar"></div></div>
        </div>
      ))}</div>
      
      <div className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
        {!isMobile && <button className="sidebar-toggle" onClick={() => setSidebarCollapsed(!sidebarCollapsed)}>{sidebarCollapsed ? '›' : '‹'}</button>}
        {!isMobile && <div className="logo"><img src="/assets/logo.png" className="logo-img" alt="logo" /> <span>DRAGONZ</span></div>}
        
        <button className={`nav-btn ${activeTab === 'orders' ? 'active' : ''}`} onClick={() => setActiveTab('orders')}>
          <img src="/assets/orders.png" className="menu-icon" alt="orders" /> <span>รายการสั่งซื้อ</span>
        </button>
        <button className={`nav-btn ${activeTab === 'products' ? 'active' : ''}`} onClick={() => setActiveTab('products')}>
          <img src="/assets/products.png" className="menu-icon" alt="products" /> <span>จัดการสินค้า</span>
        </button>
        <button className={`nav-btn ${activeTab === 'partners' ? 'active' : ''}`} onClick={() => setActiveTab('partners')}>
          <img src="/assets/partner.png" className="menu-icon" alt="partners" /> <span>พาร์ทเนอร์</span>
        </button>
        <button className={`nav-btn ${activeTab === 'categories' ? 'active' : ''}`} onClick={() => setActiveTab('categories')}>
          <img src="/assets/category.png" className="menu-icon" alt="categories" /> <span>หมวดหมู่</span>
        </button>
        <button className={`nav-btn ${activeTab === 'transactions' ? 'active' : ''}`} onClick={() => setActiveTab('transactions')}>
          <img src="/assets/transaction.png" style={{width:'20px', height:'20px'}} className="menu-icon" alt="transactions" /> <span>โอนเงิน</span>
        </button>
        
        {!isMobile && (
          <div className="logout-btn">
            <button className="btn" style={{width:'100%', background:'var(--slate-50)', justifyContent:'center'}} onClick={() => supabase.auth.signOut()}>
              <img src="/assets/logout.png" style={{width:'20px', marginRight:'10px'}} alt="logout" /> <span>ออก</span>
            </button>
          </div>
        )}
      </div>

      <main className="main-admin">
        {activeTab === 'orders' && (
          <section>
            <div className="header"><h1>รายการสั่งซื้อ</h1><button className="btn btn-dark" onClick={loadData}>รีเฟรช</button></div>
            <div className="orders-grid" style={{gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: '30px'}}>
              {db.orders.map(o => (
                <div key={o.id} className="item-card order-card" style={{
                  borderRadius: '28px', 
                  display: 'flex', 
                  flexDirection: 'column', 
                  padding: '25px', 
                  border: o.status === 'preparing' ? '2.5px solid #fbbf24' : o.status === 'ready' ? '2.5px solid #22c55e' : '1px solid var(--border)',
                  boxShadow: o.status === 'preparing' ? '0 10px 25px -5px rgba(251, 191, 36, 0.2)' : o.status === 'ready' ? '0 10px 25px -5px rgba(34, 197, 94, 0.2)' : 'none'
                }}>
                  <div className="order-header" style={{
                    borderBottom: '1px solid var(--border)', 
                    padding: '20px 25px',
                    background: o.status === 'preparing' ? '#fbbf24' : o.status === 'ready' ? '#22c55e' : 'transparent',
                    margin: (o.status === 'preparing' || o.status === 'ready') ? '-20px -20px 10px -20px' : '0 -20px 10px -20px',
                    borderRadius: (o.status === 'preparing' || o.status === 'ready') ? '28px 28px 0 0' : '0',
                    transition: 'all 0.3s ease',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <div style={{lineHeight: '1.2'}}>
                      <span style={{
                        fontSize: '0.8rem', 
                        fontWeight: 700, 
                        textTransform: 'uppercase',
                        opacity: (o.status === 'preparing' || o.status === 'ready') ? 0.9 : 0.6,
                        color: (o.status === 'preparing' || o.status === 'ready') ? '#ffffff' : 'var(--slate-500)'
                      }}>ออเดอร์</span>
                      <br/>
                      <strong style={{
                        fontSize: '1.4rem', 
                        fontWeight: 800, 
                        letterSpacing: '-1px',
                        color: (o.status === 'preparing' || o.status === 'ready') ? '#ffffff' : 'var(--darker)'
                      }}>#{o.id}</strong>
                    </div>
                    <div style={{textAlign: 'right'}}>
                      <div style={{fontWeight: 800, fontSize: '1.5rem', color: (o.status === 'preparing' || o.status === 'ready') ? '#ffffff' : 'var(--primary)'}}>฿{(o.total || 0).toLocaleString()}</div>
                      <small style={{
                        fontSize: '0.7rem',
                        opacity: (o.status === 'preparing' || o.status === 'ready') ? 0.9 : 0.7,
                        color: (o.status === 'preparing' || o.status === 'ready') ? '#ffffff' : 'var(--slate-500)'
                      }}>
                        {new Date(o.timestamp).toLocaleString()}
                      </small>
                    </div>
                  </div>
                  <div className="order-body" style={{padding: '15px 20px 10px', flex: 1}}>
                    {/* 👤 Condensed Info Block */}
                    <div style={{background: 'var(--slate-50)', padding: '12px 15px', borderRadius: '15px', border: '1px solid var(--border)', marginBottom: '15px'}}>
                      <div style={{display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px'}}>
                        <span style={{fontSize: '1.2rem'}}>👤</span>
                        <div style={{fontSize: '0.95rem', fontWeight: 800, color: 'var(--darker)'}}>{o.deliveryInfo?.name} <small style={{fontWeight: 500, color: 'var(--slate-500)'}}>({o.deliveryInfo?.phone})</small></div>
                      </div>
                      <div style={{display: 'flex', alignItems: 'center', gap: '10px', borderTop: '1px dashed var(--border)', paddingTop: '8px'}}>
                        <span style={{fontSize: '1rem'}}>🏪</span>
                        <div style={{fontSize: '0.85rem', fontWeight: 700, color: '#9f1239'}}>สาขา: {db.partners.find(p => p.id === o.partnerId)?.name || o.partnerId}</div>
                      </div>
                    </div>

                    <div className="order-items-admin" style={{
                      background: 'white', 
                      padding: '10px 15px', 
                      borderRadius: '12px', 
                      border: '1px solid var(--border)',
                      maxHeight: o.items?.length > 3 ? '215px' : 'none',
                      overflowY: 'auto'
                    }}>
                      <ul style={{listStyle:'none', padding:0, margin:0}}>
                        {(o.items || []).map((item: any, idx: number) => (
                          <li key={idx} style={{borderBottom: idx === (o.items.length - 1) ? 'none' : '1px solid var(--slate-50)', padding: '10px 0'}}>
                            <div style={{display: 'flex', alignItems: 'center', gap: '15px'}}>
                              <div style={{width: '45px', height: '45px', borderRadius: '10px', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--light)', border: '1px solid var(--border)'}}>
                                {item.imageUrl ? <img src={item.imageUrl} alt={item.name} style={{width: '100%', height: '100%', objectFit: 'cover'}} /> : <span style={{fontSize: '1.5rem'}}>{item.emoji}</span>}
                              </div>
                              <div style={{flex: 1, fontSize: '0.95rem', fontWeight: 700, lineHeight: 1.2}}>
                                {item.name} <span style={{color: 'var(--primary)'}}>x{item.quantity}</span>
                                <div style={{fontSize: '0.8rem', color: 'var(--slate-500)', fontWeight: 500}}>หวาน {item.sweetness} • ฿{item.price}</div>
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  <div className="order-footer" style={{paddingTop: '15px', marginTop: '15px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'nowrap', gap: '8px'}}>
                    <div style={{flexShrink: 0}}>
                        <div className="order-status-badge" data-status={o.status} style={{whiteSpace: 'nowrap', fontSize: '0.65rem', padding: '4px 10px'}}>{o.status === 'waiting' ? '⌛ รอยืนยัน' : o.status === 'preparing' ? '🧑‍🍳 กำลังทำ' : o.status === 'paid' ? '✅ ชำระแล้ว' : o.status === 'ready' ? '📦 พร้อมรับ' : o.status}</div>
                    </div>
                    <div style={{display: 'flex', gap: '6px', flexShrink: 0, alignItems: 'center'}}>
                      {o.deliveryInfo?.slipUrl && (
                        <a href={supabase.storage.from('product-images').getPublicUrl(o.deliveryInfo.slipUrl).data.publicUrl} target="_blank" rel="noreferrer" className="btn" style={{background: 'var(--blue-50)', color: 'var(--blue-600)', padding: '8px 10px', fontSize: '0.8rem', whiteSpace: 'nowrap', minHeight: 'auto'}}>
                          📸 สลิป
                        </a>
                      )}
                      {o.status === 'waiting' && (
                        <button className="btn btn-primary" style={{padding: '8px 10px', fontSize: '0.8rem', whiteSpace: 'nowrap', minHeight: 'auto'}} onClick={() => updateStatus(o.id, 'preparing')}>เริ่มทำ</button>
                      )}
                      {o.status !== 'ready' && o.status !== 'cancelled' && (
                        <button className="btn btn-dark" style={{padding: '8px 10px', fontSize: '0.8rem', whiteSpace: 'nowrap', minHeight: 'auto'}} onClick={() => updateStatus(o.id, 'ready')}>เสร็จแล้ว</button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
        {activeTab === 'products' && (
          <section><div className="header"><h1>จัดการสินค้า</h1><button className="btn btn-primary" onClick={() => openEditModal('products')}>+ เพิ่มสินค้า</button></div>
            <div className="item-grid-admin">{db.products.map(p => (<div key={p.id} className="item-card"><div className="admin-prod-row" style={{display:'flex', alignItems:'center', gap:'15px'}}><div className="mini-img">{p.imageUrl ? <img src={p.imageUrl} /> : <span>{p.emoji}</span>}</div><div style={{flex:1}}><strong>{p.name}</strong><br/><small>฿{p.price} • {p.category}</small></div><div style={{display:'flex', gap:'5px'}}><button className="btn btn-dark" onClick={() => openEditModal('products', p)}>📝</button><button className="btn btn-del" onClick={() => handleDelete('products', p.id)}><img src="/assets/bin.png" style={{width: '18px', height: '18px', objectFit: 'contain'}} alt="delete" /></button></div></div></div>))}</div></section>
        )}
        {activeTab === 'partners' && (
          <section><div className="header"><h1>จัดการพาร์ทเนอร์</h1><button className="btn btn-primary" onClick={() => openEditModal('partners')}>+ เพิ่มร้านใหม่</button></div>
            <div className="item-grid-admin">{db.partners.map(p => (<div key={p.id} className="item-card"><div className="admin-prod-row" style={{display:'flex', alignItems:'center', gap:'15px'}}><div style={{flex:1}}><strong>{p.name}</strong><br/><small>ID: {p.id} | PromptPay: {p.promptpay_id || 'ยังไม่ตั้งค่า'}</small><br/><small style={{color:'var(--primary)'}}>หมวดหมู่: {(p.category_names || []).join(', ') || 'ทั้งหมด'}</small></div><div style={{display:'flex', gap:'5px'}}><button className="btn btn-dark" onClick={() => openEditModal('partners', p)}>📝</button><button className="btn btn-del" onClick={() => handleDelete('partners', p.id)}><img src="/assets/bin.png" style={{width: '18px', height: '18px', objectFit: 'contain'}} alt="delete" /></button></div></div></div>))}</div></section>
        )}
        {activeTab === 'categories' && (
          <section><div className="header"><h1>จัดการหมวดหมู่</h1><button className="btn btn-primary" onClick={() => openEditModal('categories')}>+ เพิ่มหมวดหมู่</button></div>
            <div className="item-grid-admin">{db.categories.map(c => (<div key={c.id} className="item-card"><div className="admin-prod-row" style={{display:'flex', alignItems:'center', gap:'15px'}}><div style={{flex:1}}><strong>{c.name}</strong><br/><small>ลำดับ: {c.order_index}</small></div><div style={{display:'flex', gap:'5px'}}><button className="btn btn-dark" onClick={() => openEditModal('categories', c)}>📝</button><button className="btn btn-del" onClick={() => handleDelete('categories', c.id)}><img src="/assets/bin.png" style={{width: '18px', height: '18px', objectFit: 'contain'}} alt="delete" /></button></div></div></div>))}</div></section>
        )}
        {activeTab === 'transactions' && (
          <section>
            <div className="header"><h1>จัดการโอนเงิน</h1></div>
            <div className="item-card" style={{maxWidth: '600px'}}>
              <div style={{display: 'flex', gap: '20px', alignItems: 'center'}}>
                <div style={{flex: 1}}>
                  <div className="form-group">
                    <label>ชื่อบัญชี (Account Name)</label>
                    <input type="text" value={newPpName} onChange={e => setNewPpName(e.target.value)} placeholder="เช่น นายมังกร ใจดี" />
                  </div>
                  <div className="form-group">
                    <label>เลขพร้อมเพย์ (PromptPay Number)</label>
                    <input type="text" value={newPpNumber} onChange={e => setNewPpNumber(e.target.value)} placeholder="09xxxxxxxx" />
                  </div>
                  <button className="btn btn-primary" style={{width: '100%', justifyContent: 'center'}} onClick={savePayment}>บันทึกข้อมูล</button>
                </div>
                {payment && (
                  <div style={{textAlign: 'center'}}>
                    <p style={{fontWeight: 600, fontSize: '0.9rem', color: 'var(--slate-600)'}}>QR Code ปัจจุบัน</p>
                    <div style={{padding:'10px', border:'1px solid var(--slate-200)', borderRadius:'16px'}}>
                        <img 
                            src={`https://promptpay.io/${payment.promptpay_number}/0.png`} 
                            alt="PromptPay QR" 
                            style={{width: '150px', height: '150px', display: 'block', margin: '0 auto', borderRadius: '10px'}} 
                        />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}
      </main>

      {isModalOpen && editingItem && (
        <div className="modal-overlay" style={{zIndex: 5000}}><div className="product-modal" style={{padding:'30px', maxWidth:'500px'}}><button className="close-modal" onClick={() => setIsModalOpen(false)}>✕</button>
          <h2>{editingItem.id && editingItem._type !== 'partners' ? 'แก้ไขข้อมูล' : 'เพิ่มข้อมูลใหม่'}</h2>
          <div className="checkout-form" style={{marginTop:'20px'}}>
            {editingItem._type === 'partners' && (<><div className="form-group"><label>รหัสร้าน (ID)</label><input value={editingItem.id} readOnly={!!editingItem.created_at} onChange={e => setEditingItem({...editingItem, id: e.target.value})} /></div><div className="form-group"><label>ชื่อร้าน</label><input value={editingItem.name} onChange={e => setEditingItem({...editingItem, name: e.target.value})} /></div><div className="form-group"><label>เบอร์ PromptPay สาขา</label><input value={editingItem.promptpay_id || ''} onChange={e => setEditingItem({...editingItem, promptpay_id: e.target.value})} /></div>
            <div className="form-group"><label>หมวดหมู่ที่แสดง</label><div style={{display:'flex', flexWrap:'wrap', gap:'8px', marginTop:'10px'}}>
              {db.categories.map(c => (
                <div key={c.id} className={`partner-pill ${(editingItem.category_names || []).includes(c.name) ? 'active' : ''}`} onClick={() => {
                  const names = editingItem.category_names || [];
                  const newNames = names.includes(c.name) ? names.filter((n: string) => n !== c.name) : [...names, c.name];
                  setEditingItem({...editingItem, category_names: newNames});
                }}>{c.name}</div>
              ))}
            </div></div>
            </>)}
            {editingItem._type === 'categories' && (<><div className="form-group"><label>ชื่อหมวดหมู่</label><input value={editingItem.name} onChange={e => setEditingItem({...editingItem, name: e.target.value})} /></div><div className="form-group"><label>ลำดับการแสดงผล</label><input type="number" value={editingItem.order_index} onChange={e => setEditingItem({...editingItem, order_index: Number(e.target.value)})} /></div></>)}
            {editingItem._type === 'products' && (<><div className="form-group"><label>ชื่อสินค้า</label><input value={editingItem.name} onChange={e => setEditingItem({...editingItem, name: e.target.value})} /></div><div className="form-group"><label>ราคา</label><input type="number" value={editingItem.price} onChange={e => setEditingItem({...editingItem, price: Number(e.target.value)})} /></div><div className="form-group"><label>หมวดหมู่</label><select value={editingItem.category} onChange={e => setEditingItem({...editingItem, category: e.target.value})}><option value="">เลือกหมวดหมู่</option>{db.categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}</select></div></>)}
            <button className="checkout-button" style={{marginTop:'20px'}} onClick={saveItem}>บันทึกข้อมูล</button>
          </div>
        </div></div>
      )}

      {confirmModal && (
        <ConfirmationModal 
          title={confirmModal.title} 
          msg={confirmModal.msg} 
          onConfirm={confirmModal.onConfirm} 
          onClose={() => setConfirmModal(null)} 
          isOpen={!!confirmModal} 
        />
      )}
    </div>
  );
}

// --- Login Page ---
function LoginPage() {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const navigate = useNavigate();
  const handleLogin = async () => { 
    console.log("LoginPage: Attempting login...");
    const { error } = await supabase.auth.signInWithPassword({ email, password }); 
    if (!error) {
      console.log("LoginPage: Login success, navigating to /admin-panel");
      navigate('/admin-panel'); 
    } else { 
      console.error("LoginPage: Login error:", error.message);
      alert(error.message); 
    }
  };
  return (<div className="login-page"><div className="login-card"><img src="/assets/logo.png" style={{width:'80px'}} alt="logo" /><h2>Dragonz Admin</h2><input type="email" placeholder="อีเมล" value={email} onChange={e => setEmail(e.target.value)} /><input type="password" placeholder="รหัสผ่าน" value={password} onChange={e => setPassword(e.target.value)} /><button className="btn btn-dark" style={{width:'100%', padding:'20px', borderRadius:'22px'}} onClick={handleLogin}>เข้าสู่ระบบจัดการ</button></div></div>);
}

// --- App Component ---
function App() {
  const [allPartners, setAllPartners] = useState<Partner[]>([]); const [loading, setLoading] = useState(true);
  useEffect(() => { 
    console.log("App: Initializing...");
    async function fetchPartners() { 
      try { 
        const { data } = await supabase.from('partners').select('*'); 
        if (data) setAllPartners(data); 
      } catch (e) { console.error("App: Fetch Partners Error:", e); } 
      finally { setLoading(false); } 
    } 
    fetchPartners(); 
  }, []);

  if (loading) return (
    <div className="loading-screen" style={{flexDirection: 'column', gap: '20px'}}>
      <img src="/assets/logo.png" style={{width: '100px', height: '100px', objectFit: 'contain', animation: 'dragonPulse 2s infinite'}} alt="logo" />
      <div style={{fontWeight: 800, letterSpacing: '-1px'}}>Dragonz Cha...</div>
    </div>
  );

  console.log("App: Rendering Routes...");

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/store/:partnerId" element={<StorePage allPartners={allPartners} />} />
        <Route path="/admin-panel" element={<AdminDashboard />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/admin" element={<div className="loading-screen">กำลังย้ายไปยังหน้าจัดการ... (โปรดใช้ /admin-panel)</div>} />
        <Route path="/" element={<div className="loading-screen" style={{background: '#f1f5f9'}}>
          <div style={{textAlign: 'center'}}>
            <h1 style={{fontSize: '4rem'}}>🐉</h1>
            <h2>404 - ไม่พบหน้าเว็บ</h2>
            <p>กรุณาระบุรหัสร้านค้าใน URL</p>
          </div>
        </div>} />
        <Route path="*" element={<div className="loading-screen" style={{background: '#f1f5f9'}}>
          <div style={{textAlign: 'center'}}>
            <h1 style={{fontSize: '4rem'}}>🐉</h1>
            <h2>404 - ไม่พบหน้าเว็บ</h2>
            <p>หน้าที่คุณต้องการไม่มีอยู่จริง</p>
          </div>
        </div>} />
      </Routes>
    </BrowserRouter>
  );
}

export default App

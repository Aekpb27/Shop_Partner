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

  const [checkoutStep, setCheckoutStep] = useState<'cart' | 'details' | 'payment' | 'status'>(() => {
    return (localStorage.getItem(`dragonz_step_${partnerId}`) as any) || 'cart';
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

  const [paymentTimeLeft, setPaymentTimer] = useState(900);
  const [ppList, setPpList] = useState<string[]>(['0958412521']);
  const [flyingItem, setFlyingItem] = useState<{x: number, y: number, targetX: number, targetY: number, emoji: string} | null>(null);
  const toastTimeoutRef = useRef<any>(null);
  const timerRef = useRef<any>(null);

  useEffect(() => { localStorage.setItem(`dragonz_cart_${partnerId}`, JSON.stringify(cart)); }, [cart, partnerId]);
  useEffect(() => { localStorage.setItem(`dragonz_step_${partnerId}`, checkoutStep); }, [checkoutStep, partnerId]);
  useEffect(() => { localStorage.setItem(`dragonz_delivery_${partnerId}`, JSON.stringify(deliveryInfo)); }, [deliveryInfo, partnerId]);
  useEffect(() => { if (activeOrderId) localStorage.setItem(`active_order_${partnerId}`, String(activeOrderId)); }, [activeOrderId, partnerId]);

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
    const fetchSettings = async () => {
      const { data } = await supabase.from('settings').select('*').eq('id', 'payment').single();
      if (data && data.value.promptpay_numbers) setPpList(data.value.promptpay_numbers);
    };
    fetchSettings();
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
        deliveryInfo: { ...deliveryInfo, slipUrl: fileName }, total: cartTotal, status: 'paid', timestamp: new Date().toISOString()
      };
      const { error } = await supabase.from('orders').insert([orderData]);
      if (!error) {
        localStorage.removeItem(`dragonz_cart_${partnerId}`);
        localStorage.removeItem(`dragonz_step_${partnerId}`);
        setCart([]); setCheckoutStep('status'); showNotification('✅ ส่งข้อมูลสำเร็จ!');
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
  const targetPP = (partner?.promptpay_id || ppList[0] || '0958412521').replace(/[^0-9]/g, '');

  if (!partner && !loading) return <div className="loading-screen">404 Not Found - ไม่พบร้านค้า</div>;
  if (loading) return <div className="loading-screen">กำลังเตรียมข้อมูล... 🐉</div>;

  return (
    <div className={`app ${isMobile ? 'mobile-view' : 'desktop-view'}`}>
      {toast && <ToastNotification message={toast} />}
      {flyingItem && <div className="flying-item" style={{ left: flyingItem.x, top: flyingItem.y, '--target-x': `${flyingItem.targetX}px`, '--target-y': `${flyingItem.targetY}px` } as any}>{flyingItem.emoji}</div>}
      
      <nav className="navbar">
        <div className="brand-title">
          <span style={{fontSize: isMobile ? '1.5rem' : '2.2rem'}}>{partner?.logo || '🐉'}</span>
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
            <div className="cart-header"><h2>{checkoutStep === 'cart' ? 'ตะกร้าสินค้า' : checkoutStep === 'details' ? 'ข้อมูลจัดส่ง' : checkoutStep === 'payment' ? 'ชำระเงิน' : 'ติดตามออเดอร์'}</h2><button className="close-cart" onClick={closeCart}>✕</button></div>
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
                  <div className="qr-container"><img src={`https://promptpay.io/${targetPP}/${cartTotal}.png`} alt="PromptPay QR" style={{width: '250px', height: '250px', display: 'block', margin: '0 auto'}} /><div className="qr-label">สแกนจ่ายด้วยแอปธนาคารทุกแอป</div></div>
                  <div className="payment-details"><div className="row"><span>ยอดโอนทั้งหมด:</span><strong style={{color:'var(--primary)', fontSize:'1.4rem'}}>฿{cartTotal}</strong></div><div className="row"><span>รหัสออเดอร์:</span><strong>#{activeOrderId}</strong></div></div>
                  <div className="upload-section"><label className="upload-btn"><input type="file" accept="image/*" style={{display:'none'}} onChange={handleInformPayment} /><span>📸 อัปโหลดสลิปเพื่อยืนยัน</span></label></div>
                </div>
              )}
              {checkoutStep === 'status' && (
                <div className="status-step"><div className="status-hero"><div className="dragon-pulse">🐉</div><h3>ส่งข้อมูลการโอนเรียบร้อย</h3><p>รอแอดมินตรวจสอบยอดเงินสักครู่ครับ</p></div><div className="status-timeline"><div className="step active"><span>1</span> <div>ได้รับคำสั่งซื้อ</div></div><div className="step active"><span>2</span> <div>รอแอดมินยืนยันยอด</div></div><div className="step"><span>3</span> <div>กำลังจัดเตรียมสินค้า</div></div><div className="step"><span>4</span> <div>สินค้าพร้อมรับ</div></div></div><button className="btn btn-dark" style={{width:'100%', marginTop:'30px', padding:'15px', borderRadius:'15px'}} onClick={() => { clearSession(); }}>สั่งออเดอร์ใหม่</button></div>
              )}
            </div>
            {checkoutStep !== 'status' && cart.length > 0 && (
              <div className="cart-footer"><div className="cart-summary-block"><div className="summary-info"><span style={{fontWeight:700, color:'#64748b'}}>ยอดชำระทั้งหมด</span><span className="summary-value">฿{cartTotal}</span></div><div className="btn-group">
                {checkoutStep === 'cart' && <button className="checkout-button" onClick={() => setCheckoutStep('details')}>ไปที่ข้อมูลจัดส่ง</button>}
                {checkoutStep === 'details' && (<><button className="btn-back" style={{justifyContent:'center'}} onClick={() => setCheckoutStep('cart')}>ย้อนกลับ</button><button className="checkout-button" style={{flex:2}} onClick={createPendingOrder}>ชำระเงิน</button></>)}
                {checkoutStep === 'payment' && (<button className="btn-cancel" onClick={() => { setCheckoutStep('details'); }}>ยกเลิกรายการ</button>)}
              </div></div></div>
            )}
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
  const [db, setDb] = useState<{products: Product[], partners: Partner[], categories: Category[], orders: Order[]}>({ products: [], partners: [], categories: [], orders: [] });
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<string[]>([]);
  const [orderAlerts, setOrderAlerts] = useState<any[]>([]);
  const [settings, setSettings] = useState({ promptpay_numbers: [] as string[] });
  const [toast, setToast] = useState<string | null>(null);
  const [newPp, setNewPp] = useState('');
  const [editingItem, setEditingItem] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{title: string, msg: string, onConfirm: () => void} | null>(null);
  
  const navigate = useNavigate();
  const notificationAudio = useRef(new Audio('/assets/alert.mp3'));

  const showConfirm = (title: string, msg: string, onConfirm: () => void) => {
    setConfirmModal({ title, msg, onConfirm });
  };
  useEffect(() => { localStorage.setItem('dragonz_admin_tab', activeTab); }, [activeTab]);

  const showNotification = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };
  const addLog = (msg: string) => { const time = new Date().toLocaleTimeString(); setLogs(prev => [...prev, `[${time}] ${msg}`].slice(-20)); };

  const loadData = async () => {
    addLog("โหลดข้อมูล...");
    try {
      const [prod, part, cat, ord, sett] = await Promise.all([
        supabase.from('products').select('*').order('id', { ascending: true }),
        supabase.from('partners').select('*'),
        supabase.from('categories').select('*').order('order_index', { ascending: true }),
        supabase.from('orders').select('*').order('timestamp', { ascending: false }),
        supabase.from('settings').select('*').eq('id', 'payment').single()
      ]);
      setDb({ products: prod.data || [], partners: part.data || [], categories: cat.data || [], orders: ord.data || [] });
      if (sett.data) setSettings(sett.data.value);
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

  const saveSettings = async (newList: string[]) => {
    const { error } = await supabase.from('settings').upsert({ id: 'payment', value: { ...settings, promptpay_numbers: newList } });
    if (!error) { setSettings({...settings, promptpay_numbers: newList}); showNotification('✅ บันทึกสำเร็จ'); }
  };

  const addPpNumber = () => { if (newPp) { saveSettings([...settings.promptpay_numbers, newPp]); setNewPp(''); } };
  const removePpNumber = (num: string) => {
    showConfirm('ลบเบอร์ PromptPay?', `คุณต้องการลบเบอร์ ${num} ออกจากรายการใช่หรือไม่?`, () => {
      saveSettings(settings.promptpay_numbers.filter(n => n !== num));
    });
  };
  
  const updateStatus = async (id: number, status: string) => { await supabase.from('orders').update({ status }).eq('id', id); loadData(); };
  
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
      <div id="notification-container">{orderAlerts.map(alert => (<div key={alert.id} className="order-alert" onClick={() => { setOrderAlerts(prev => prev.filter(a => a.id !== alert.id)); notificationAudio.current.pause(); }}><div className="close-alert">✕</div><h4>🔔 ออเดอร์ใหม่!</h4><p>#{alert.id} จากร้าน: <strong>{alert.partnerName}</strong></p><p style={{fontWeight:800, color:'var(--primary)'}}>ยอด: ฿{alert.total}</p><div className="timer-bar-container"><div className="timer-bar"></div></div></div>))}</div>
      
      <div className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <button className="sidebar-toggle" onClick={() => setSidebarCollapsed(!sidebarCollapsed)}>{sidebarCollapsed ? '›' : '‹'}</button>
        <div className="logo"><img src="/assets/logo.png" className="logo-img" alt="logo" /> <span>DRAGONZ</span></div>
        
        <button className={`nav-btn ${activeTab === 'orders' ? 'active' : ''}`} onClick={() => setActiveTab('orders')}><img src="/assets/orders.png" className="menu-icon" alt="orders" /> <span>รายการสั่งซื้อ</span></button>
        <button className={`nav-btn ${activeTab === 'products' ? 'active' : ''}`} onClick={() => setActiveTab('products')}><img src="/assets/products.png" className="menu-icon" alt="products" /> <span>จัดการสินค้า</span></button>
        <button className={`nav-btn ${activeTab === 'partners' ? 'active' : ''}`} onClick={() => setActiveTab('partners')}><img src="/assets/partner.png" className="menu-icon" alt="partners" /> <span>พาร์ทเนอร์</span></button>
        <button className={`nav-btn ${activeTab === 'categories' ? 'active' : ''}`} onClick={() => setActiveTab('categories')}><img src="/assets/category.png" className="menu-icon" alt="categories" /> <span>หมวดหมู่</span></button>
        <button className={`nav-btn ${activeTab === 'promptpay' ? 'active' : ''}`} onClick={() => setActiveTab('promptpay')}>📱 <span>ตั้งค่า PromptPay</span></button>
        
        <div className="logout-btn"><button className="btn" style={{width:'100%', background:'var(--slate-50)', justifyContent:'center'}} onClick={() => supabase.auth.signOut()}><img src="/assets/logout.png" style={{width:'20px', marginRight:'10px'}} alt="logout" /> <span>ออก</span></button></div>
      </div>

      <main className="main-admin">
        {activeTab === 'orders' && (
          <section><div className="header"><h1>รายการสั่งซื้อ</h1><button className="btn btn-dark" onClick={loadData}>รีเฟรช</button></div>
            <div className="orders-grid">{db.orders.map(o => (<div key={o.id} className="item-card order-card"><div className="order-header"><div><strong>#{o.id}</strong><br/><small>{o.partnerId} • {new Date(o.timestamp).toLocaleString()}</small></div><div className="order-status-badge" data-status={o.status}>{o.status}</div></div>
              <div style={{margin:'10px 0', fontSize:'0.85rem'}}><strong>ลูกค้า:</strong> {o.deliveryInfo?.name} ({o.deliveryInfo?.phone})<br/><strong>สลิป:</strong> <a href={supabase.storage.from('product-images').getPublicUrl(o.deliveryInfo?.slipUrl).data.publicUrl} target="_blank" rel="noreferrer" style={{color:'var(--primary)', fontWeight:700}}>ดูรูปสลิป</a></div>
              <div className="order-items">{(o.items || []).map((item: any, idx: number) => (<div key={idx} className="mini-item"><div>{item.name} x {item.quantity} (หวาน {item.sweetness})</div></div>))}</div>
              <div style={{display:'flex', gap:'5px', marginTop:'15px'}}><button className="btn btn-primary" onClick={() => updateStatus(o.id, 'preparing')}>เริ่มทำ</button><button className="btn btn-dark" onClick={() => updateStatus(o.id, 'ready')}>เสร็จแล้ว</button></div>
            </div>))}</div></section>
        )}
        {activeTab === 'products' && (
          <section><div className="header"><h1>จัดการสินค้า</h1><button className="btn btn-primary" onClick={() => openEditModal('products')}>+ เพิ่มสินค้า</button></div>
            <div className="item-grid-admin">{db.products.map(p => (<div key={p.id} className="item-card"><div className="admin-prod-row" style={{display:'flex', alignItems:'center', gap:'15px'}}><div className="mini-img">{p.imageUrl ? <img src={p.imageUrl} /> : <span>{p.emoji}</span>}</div><div style={{flex:1}}><strong>{p.name}</strong><br/><small>฿{p.price} • {p.category}</small></div><div style={{display:'flex', gap:'5px'}}><button className="btn btn-dark" onClick={() => openEditModal('products', p)}>📝</button><button className="btn btn-del" onClick={() => handleDelete('products', p.id)}>🗑️</button></div></div></div>))}</div></section>
        )}
        {activeTab === 'partners' && (
          <section><div className="header"><h1>จัดการพาร์ทเนอร์</h1><button className="btn btn-primary" onClick={() => openEditModal('partners')}>+ เพิ่มร้านใหม่</button></div>
            <div className="item-grid-admin">{db.partners.map(p => (<div key={p.id} className="item-card"><div className="admin-prod-row" style={{display:'flex', alignItems:'center', gap:'15px'}}><div style={{flex:1}}><strong>{p.name}</strong><br/><small>ID: {p.id} | PromptPay: {p.promptpay_id || 'ยังไม่ตั้งค่า'}</small><br/><small style={{color:'var(--primary)'}}>หมวดหมู่: {(p.category_names || []).join(', ') || 'ทั้งหมด'}</small></div><div style={{display:'flex', gap:'5px'}}><button className="btn btn-dark" onClick={() => openEditModal('partners', p)}>📝</button><button className="btn btn-del" onClick={() => handleDelete('partners', p.id)}>🗑️</button></div></div></div>))}</div></section>
        )}
        {activeTab === 'categories' && (
          <section><div className="header"><h1>จัดการหมวดหมู่</h1><button className="btn btn-primary" onClick={() => openEditModal('categories')}>+ เพิ่มหมวดหมู่</button></div>
            <div className="item-grid-admin">{db.categories.map(c => (<div key={c.id} className="item-card"><div className="admin-prod-row" style={{display:'flex', alignItems:'center', gap:'15px'}}><div style={{flex:1}}><strong>{c.name}</strong><br/><small>ลำดับ: {c.order_index}</small></div><div style={{display:'flex', gap:'5px'}}><button className="btn btn-dark" onClick={() => openEditModal('categories', c)}>📝</button><button className="btn btn-del" onClick={() => handleDelete('categories', c.id)}>🗑️</button></div></div></div>))}</div></section>
        )}
        {activeTab === 'promptpay' && (
          <section><div className="header"><h1>ตั้งค่า PromptPay</h1></div>
            <div className="item-card" style={{maxWidth:'600px', padding:'30px'}}>
              <div className="form-group" style={{marginBottom:'20px'}}><label>เพิ่มเบอร์ PromptPay ใหม่</label>
                <div style={{display:'flex', gap:'10px'}}><input type="text" placeholder="เช่น 095xxxxxxx" value={newPp} onChange={e => setNewPp(e.target.value)} /><button className="btn btn-primary" onClick={addPpNumber}>เพิ่ม</button></div>
              </div>
              <div className="pp-list"><strong>รายการเบอร์ที่ใช้งานอยู่:</strong>
                {settings.promptpay_numbers?.map(num => (<div key={num} style={{display:'flex', justifyContent:'space-between', padding:'15px', background:'var(--light)', borderRadius:'12px', marginTop:'10px'}}><span>{num}</span><button style={{color:'red', border:'none', background:'none', cursor:'pointer'}} onClick={() => removePpNumber(num)}>ลบ</button></div>))}
              </div>
            </div></section>
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
  const handleLogin = async () => { const { error } = await supabase.auth.signInWithPassword({ email, password }); if (!error) navigate('/admin'); else alert(error.message); };
  return (<div className="login-page"><div className="login-card"><img src="/assets/logo.png" style={{width:'80px'}} alt="logo" /><h2>Dragonz Admin</h2><input type="email" placeholder="อีเมล" value={email} onChange={e => setEmail(e.target.value)} /><input type="password" placeholder="รหัสผ่าน" value={password} onChange={e => setPassword(e.target.value)} /><button className="btn btn-dark" style={{width:'100%', padding:'20px', borderRadius:'22px'}} onClick={handleLogin}>เข้าสู่ระบบจัดการ</button></div></div>);
}

// --- App Component ---
function App() {
  const [allPartners, setAllPartners] = useState<Partner[]>([]); const [loading, setLoading] = useState(true);
  useEffect(() => { async function fetchPartners() { try { const { data } = await supabase.from('partners').select('*'); if (data) setAllPartners(data); } catch (e) { console.error(e); } finally { setLoading(false); } } fetchPartners(); }, []);
  if (loading) return <div className="loading-screen">Dragonz Cha... 🐉</div>;
  return (<BrowserRouter><Routes><Route path="/store/:partnerId" element={<StorePage allPartners={allPartners} />} /><Route path="/admin" element={<AdminDashboard />} /><Route path="/login" element={<LoginPage />} /><Route path="/" element={<div className="loading-screen">404 - กรุณาระบุรหัสร้านค้า</div>} /></Routes></BrowserRouter>);
}

export default App

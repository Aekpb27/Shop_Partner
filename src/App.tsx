import { useState, useEffect, useRef } from 'react'
import { BrowserRouter, Routes, Route, useParams, Navigate, Link } from 'react-router-dom'
import './App.css'
import { supabase } from './supabaseClient'

interface Partner {
  id: string;
  name: string;
  thaiName: string;
  logo: string;
}

interface Product {
  id: number;
  partnerIds: string[];
  name: string;
  price: number;
  emoji: string;
  category: string;
  imageUrl?: string;
}

interface CartItem extends Product {
  quantity: number;
  sweetness: string;
}

function StorePage({ allPartners }: { allPartners: Partner[] }) {
  const { partnerId } = useParams<{ partnerId: string }>();
  const partner = allPartners.find(p => p.id === partnerId);

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>(['All']);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCartClosing, setIsCartClosing] = useState(false); // ✨ State สำหรับอนิเมชั่นปิดตะกร้า
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [toast, setToast] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [cartAnim, setCartAnim] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // ✨ State สำหรับ Dialog และ อนิเมชั่นปิด
  const [activeProduct, setActiveProduct] = useState<Product | null>(null);
  const [isModalClosing, setIsModalClosing] = useState(false);
  const [tempSweetness, setTempSweetness] = useState('100%');

  // ✨ State สำหรับ Flying Item
  const [flyingItem, setFlyingItem] = useState<{x: number, y: number, targetX: number, targetY: number, emoji: string} | null>(null);

  const animTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const checkMobile = () => {
      const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      setIsMobile(isMobileUA || window.innerWidth <= 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    async function fetchData() {
      if (!partnerId) return;
      setLoading(true);
      try {
        const { data: catData } = await supabase.from('categories').select('name').order('order_index', { ascending: true });
        if (catData) setCategories(['All', ...catData.map(c => c.name)]);
        const { data: prodData } = await supabase.from('products').select('*').contains('partnerIds', [partnerId]).order('id', { ascending: true });
        if (prodData) setProducts(prodData);
      } catch (e) { console.error(e); } finally { setLoading(false); }
    }
    fetchData();
  }, [partnerId]);

  if (!partner && !loading) return <div className="loading-screen">ไม่พบข้อมูลร้านค้า</div>;
  if (loading) return <div className="loading-screen">กำลังเตรียมข้อมูล... 🐉</div>;

  const openProductModal = (product: Product) => {
    setActiveProduct(product);
    setIsModalClosing(false);
    setTempSweetness('100%');
  };

  const closeProductModal = () => {
    setIsModalClosing(true);
    setTimeout(() => {
      setActiveProduct(null);
      setIsModalClosing(false);
    }, 300); // รออนิเมชั่นจบ
  };

  const openCart = () => {
    setIsCartOpen(true);
    setIsCartClosing(false);
  };

  const closeCart = () => {
    setIsCartClosing(true);
    setTimeout(() => {
      setIsCartOpen(false);
      setIsCartClosing(false);
    }, 400); // รออนิเมชั่นจบ
  };

  const confirmAddToCart = (e: React.MouseEvent) => {
    if (!activeProduct) return;

    // 🚀 คำนวณตำแหน่งสำหรับ Flying Animation
    const rect = e.currentTarget.getBoundingClientRect();
    const cartBtn = document.querySelector('.cart-trigger');
    if (cartBtn) {
      const cartRect = cartBtn.getBoundingClientRect();
      setFlyingItem({
        x: rect.left,
        y: rect.top,
        targetX: cartRect.left - rect.left,
        targetY: cartRect.top - rect.top,
        emoji: activeProduct.emoji
      });
      setTimeout(() => setFlyingItem(null), 800);
    }
    
    setCart(prev => {
      const exist = prev.find(i => i.id === activeProduct.id && i.sweetness === tempSweetness);
      if (exist) return prev.map(i => i === exist ? {...i, quantity: i.quantity + 1} : i);
      return [...prev, { ...activeProduct, quantity: 1, sweetness: tempSweetness }];
    });

    if (animTimeoutRef.current) clearTimeout(animTimeoutRef.current);
    setCartAnim(false);
    setTimeout(() => {
      setCartAnim(true);
      animTimeoutRef.current = setTimeout(() => setCartAnim(false), 300);
    }, 10);

    closeProductModal();
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast(`เพิ่ม ${activeProduct.name} แล้ว!`);
    toastTimeoutRef.current = setTimeout(() => setToast(null), 2000);
  };

  const updateQuantity = (id: number, sweetness: string, delta: number) => {
    setCart(prev => prev.map(item =>
      item.id === id && item.sweetness === sweetness ? { ...item, quantity: item.quantity + delta } : item
    ).filter(item => item.quantity > 0));
  };

  const cartTotal = cart.reduce((s, i) => s + (i.price * i.quantity), 0);
  const filteredProducts = selectedCategory === 'All' ? products : products.filter(p => p.category === selectedCategory);

  return (
    <div className={`app ${isMobile ? 'mobile-view' : 'desktop-view'}`}>
      {toast && <div className="toast">{toast}</div>}
      
      {/* 🚀 Flying Item Overlay */}
      {flyingItem && (
        <div className="flying-item" style={{ 
          left: flyingItem.x, 
          top: flyingItem.y, 
          '--target-x': `${flyingItem.targetX}px`, 
          '--target-y': `${flyingItem.targetY}px` 
        } as any}>
          {flyingItem.emoji}
        </div>
      )}

      <nav className="navbar">
        <div className="brand-title">
          <span style={{fontSize: isMobile ? '1.5rem' : '2.2rem'}}>{partner?.logo}</span>
          <div className="brand-text">Dragonz Cha</div>
        </div>
        <button className={`cart-trigger ${cartAnim ? 'cart-bump' : ''}`} onClick={openCart}>
          <span className="cart-total-badge">฿{cartTotal}</span>
          <div className="cart-count">{cart.reduce((a, b) => a + b.quantity, 0)}</div>
        </button>
      </nav>

      <header className="hero">
        <div className="hero-badge">{partner?.name} Official</div>
        <h1>{(partner?.thaiName || '').split(' ')[0]} <span>{(partner?.thaiName || '').split(' ')[1] || ''}</span></h1>
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
            <div className="img-wrapper">
              {product.imageUrl ? <img src={product.imageUrl} alt={product.name} /> : <span style={{fontSize: '4rem'}}>{product.emoji}</span>}
            </div>
            <div className="product-info">
              <div className="product-title">{product.name}</div>
              <div className="price-container">
                <span className="amount">฿{product.price}</span>
                <button className="add-button">+</button>
              </div>
            </div>
          </div>
        ))}
      </main>

      {/* ✨ Dialog เลือกความหวาน พร้อมอนิเมชั่น เข้า-ออก */}
      {activeProduct && (
        <div className={`modal-overlay ${isModalClosing ? 'exit' : ''}`} onClick={closeProductModal}>
          <div className={`product-modal ${isModalClosing ? 'exit' : ''}`} onClick={e => e.stopPropagation()}>
            <button className="close-modal" onClick={closeProductModal}>✕</button>
            <div className="modal-img">
              {activeProduct.imageUrl ? <img src={activeProduct.imageUrl} /> : <span>{activeProduct.emoji}</span>}
            </div>
            <div className="modal-details">
              <h2>{activeProduct.name}</h2>
              <p className="modal-category">{activeProduct.category}</p>
              <div className="sweetness-selection">
                <label>เลือกระดับความหวาน</label>
                <div className="sweet-grid">
                  {['0%', '25%', '50%', '75%', '100%'].map(level => (
                    <button key={level} className={`sweet-pill ${tempSweetness === level ? 'active' : ''}`} onClick={() => setTempSweetness(level)}>
                      <span className="pill-val">{level}</span>
                      <span className="pill-lbl">{level === '0%' ? 'ไม่หวาน' : level === '100%' ? 'หวานปกติ' : 'หวาน'}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="modal-footer">
                <div className="modal-price">฿{activeProduct.price}</div>
                <button className="confirm-add-btn" onClick={confirmAddToCart}>ใส่ตะกร้า</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ✨ ตะกร้าสินค้า พร้อมอนิเมชั่น เข้า-ออก */}
      {isCartOpen && (
        <div className={`cart-overlay ${isCartClosing ? 'exit' : ''}`} onClick={closeCart}>
          <div className={`cart-drawer ${isCartClosing ? 'exit' : ''}`} onClick={e => e.stopPropagation()}>
            <div className="cart-header">
              <h2>ตะกร้าสินค้า</h2>
              <button className="close-cart" onClick={closeCart}>✕</button>
            </div>
            <div className="cart-content">
              {cart.length === 0 ? <div style={{textAlign:'center', marginTop:'50px', fontWeight:700, opacity:0.5}}>ตะกร้าว่างเปล่า</div> : cart.map(item => (
                <div key={`${item.id}-${item.sweetness}`} className="cart-item">
                  <div className="cart-item-img">
                    {item.imageUrl ? <img src={item.imageUrl} alt={item.name} /> : <span>{item.emoji}</span>}
                  </div>
                  <div className="item-details">
                    <div className="item-name">{item.name}</div>
                    <div className="item-meta">ความหวาน: {item.sweetness}</div>
                    <div className="item-bottom">
                      <div className="item-price">฿{item.price * item.quantity}</div>
                      <div className="qty-control">
                        <button onClick={() => updateQuantity(item.id, item.sweetness, -1)}>−</button>
                        <span>{item.quantity}</span>
                        <button onClick={() => updateQuantity(item.id, item.sweetness, 1)}>+</button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {cart.length > 0 && (
              <div className="cart-footer">
                <div className="cart-summary-block">
                  <div className="summary-info">
                    <span style={{fontWeight:700, color:'#64748b'}}>ยอดชำระทั้งหมด</span>
                    <span className="summary-value">฿{cartTotal}</span>
                  </div>
                  <button className="checkout-button">ยืนยันรายการสั่งซื้อ</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      
      <div className="footer-links">
        <div style={{display: 'flex', gap: '15px', justifyContent: 'center', flexWrap: 'wrap'}}>
           {allPartners.map(p => (
             <Link key={p.id} to={`/store/${p.id}`} style={{fontSize: '0.75rem', color: '#64748b', textDecoration: 'none', fontWeight: 600}}>• {p.name}</Link>
           ))}
        </div>
      </div>
    </div>
  );
}

function App() {
  const [allPartners, setAllPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPartners() {
      try {
        const { data } = await supabase.from('partners').select('*');
        if (data && data.length > 0) setAllPartners(data);
      } catch (e) { console.error(e); } finally { setLoading(false); }
    }
    fetchPartners();
  }, []);

  if (loading) return <div className="loading-screen">กำลังเตรียมข้อมูล... 🐉</div>;

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/store/:partnerId" element={<StorePage allPartners={allPartners} />} />
        <Route path="/" element={<Navigate to={`/store/${allPartners[0]?.id || 'dragonz'}`} replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App

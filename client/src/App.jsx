```javascript
import { useState, useEffect, createContext } from 'react'
import { db } from './firebase.js'
import { collection, getDocs } from 'firebase/firestore'

export const AppContext = createContext()

function App() {
  const [user, setUser] = useState(null)
  const [lang, setLang] = useState('ar')
  const [services, setServices] = useState([])
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('الكل')
  const [showForm, setShowForm] = useState(false)
  const [demoMode, setDemoMode] = useState(false)

  // تهيئة Pi SDK آلياً وتحسس البيئة لمود الديمو
  useEffect(() => {
    const initPi = async () => {
      if (window.Pi) {
        window.Pi.init({ version: "2.0", sandbox: true })
      } else {
        setDemoMode(true) // تشغيل تلقائي لوضع الديمو خارج متصفح باي
        const script = document.createElement('script')
        script.src = 'https://sdk.minepi.com/pi-sdk.js'
        script.onload = () => window.Pi.init({ version: "2.0", sandbox: true })
        document.head.appendChild(script)
      }
    }
    initPi()
  }, [])

  // جلب الخدمات مباشرة من Firestore لتحسين السرعة والأداء
  useEffect(() => {
    const fetchServices = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, 'services'))
        const servicesList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        // ترتيب تنازلي يدوي أو عبر تحديث البيانات
        setServices(servicesList)
      } catch (err) {
        console.error("Error fetching services: ", err)
      }
    }
    fetchServices()
  }, [])

  // تسجيل الدخول عبر Pi أو المحاكاة
  const login = async () => {
    if (demoMode || !window.Pi) {
      setUser('DemoUser_Fuad207')
      alert('وضع تجريبي مفعل - DemoUser_Fuad207')
      return
    }
    try {
      const scopes = ['username', 'payments']
      window.Pi.authenticate(scopes, onIncompletePaymentFound)
        .then(function(auth) {
          setUser(auth.user.username)
        }).catch(function(err) {
          console.error(err)
        })
    } catch (err) {
      console.error(err)
    }
  }

  function onIncompletePaymentFound(payment) {
    fetch('http://localhost:5000/api/pi/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentId: payment.identifier, txid: payment.transaction.txid })
    })
  }

  // إضافة خدمة جديدة عبر الخادم (Server) لضمان الأمان والامتثال لـ Rules
  const addService = async (formData) => {
    const service = { ...formData, seller_id: user }
    
    // TODO: AI Content Moderation - فحص المحتوى المخالف آلياً هنا مستقبلاً
    
    const res = await fetch('http://localhost:5000/api/services', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(service)
    })
    if (res.ok) {
      const newService = await res.json()
      setServices([newService, ...services])
      setShowForm(false)
    } else {
      alert('فشلت عملية إضافة الخدمة، تأكد من صحة المدخلات والسعر.')
    }
  }

  // بروتوكول الشراء الرسمي بدون دمج await مع دوال callback التابعة لـ Pi SDK
  const buyService = (service) => {
    if (demoMode || !window.Pi) {
      alert('تم محاكاة شراء الخدمة بنجاح في وضع الديمو التجريبي')
      return
    }
    
    const paymentData = {
      amount: service.price,
      memo: service[lang === 'ar' ? 'title' : 'titleEn'],
      metadata: JSON.stringify({ serviceId: service.id })
    }

    window.Pi.createPayment(paymentData, {
      onReadyForServerApproval: async (paymentId) => {
        await fetch('http://localhost:5000/api/pi/approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentId })
        })
      },
      onReadyForServerCompletion: async (paymentId, txid) => {
        await fetch('http://localhost:5000/api/pi/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentId, txid })
        })
        alert('تمت المعاملة المالية والدفع بنجاح!')
      },
      onCancel: () => alert('تم إلغاء عملية الدفع من قبل المستخدم'),
      onError: (err) => alert('حدث خطأ أثناء معالجة الدفع: ' + err.message)
    })
  }

  const filteredServices = services.filter(s => {
    const text = s[lang === 'ar' ? 'title' : 'titleEn']?.toLowerCase() || ''
    const matchSearch = text.includes(search.toLowerCase())
    const matchCategory = category === 'الكل' || s.category === category
    return matchSearch && matchCategory
  })

  const categories = ['الكل', 'تصميم', 'كتابة', 'برمجة', 'منتجات رقمية']

  return (
    <AppContext.Provider value={{ user, lang, setLang }}>
      <div className={lang === 'ar' ? 'rtl' : 'ltr'} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <header className="bg-white shadow-sm p-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-primary">PiGigs</h1>
          <div className="flex gap-2">
            <button onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')} className="px-3 py-1 border rounded-lg">
              {lang === 'ar' ? 'EN' : 'AR'}
            </button>
            {user ? (
              <button onClick={() => setShowForm(true)} className="px-4 py-1 bg-primary text-white rounded-lg">
                {lang === 'ar' ? 'أضف خدمة' : 'Add Service'}
              </button>
            ) : (
              <button onClick={login} className="px-4 py-1 bg-primary text-white rounded-lg">
                {lang === 'ar' ? 'تسجيل دخول عبر Pi' : 'Login with Pi'}
              </button>
            )}
          </div>
        </header>

        <div className="p-4 max-w-6xl mx-auto">
          <input
            type="text"
            placeholder={lang === 'ar' ? 'ابحث عن خدمة...' : 'Search service...'}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full p-3 border rounded-xl mb-4"
          />
          <div className="flex gap-2 flex-wrap mb-6">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`px-4 py-2 rounded-lg ${category === cat ? 'bg-primary text-white' : 'bg-white border'}`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredServices.map(service => (
              <div key={service.id} className="bg-white rounded-xl shadow-sm p-4">
                <img src={service.image} alt="" className="w-full h-40 object-cover rounded-lg mb-3" />
                <h3 className="font-bold text-lg mb-1">{service[lang === 'ar' ? 'title' : 'titleEn']}</h3>
                <p className="text-gray-600 text-sm mb-2 line-clamp-2">{service[lang === 'ar' ? 'description' : 'descriptionEn']}</p>
                <p className="text-sm text-gray-500 mb-3">@{service.seller_id}</p>
                <div className="flex justify-between items-center">
                  <span className="font-bold text-primary">{service.price} Pi</span>
                  <button onClick={() => buyService(service)} className="px-4 py-2 bg-primary text-white rounded-lg">
                    {lang === 'ar' ? 'شراء الآن' : 'Buy Now'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {showForm && <AddServiceForm onSubmit={addService} onClose={() => setShowForm(false)} lang={lang} />}

        <footer className="bg-white text-center p-4 mt-8 font-bold border-t">
          PiGigs developed by @Fuad207. Independent utility app, not affiliated with Pi Core Team.
        </footer>
      </div>
    </AppContext.Provider>
  )
}

function AddServiceForm({ onSubmit, onClose, lang }) {
  const [form, setForm] = useState({
    title: '', titleEn: '', description: '', descriptionEn: '',
    price: '', category: 'تصميم', image: ''
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    onSubmit({ ...form, price: parseFloat(form.price) })
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-4">{lang === 'ar' ? 'إضافة خدمة جديدة' : 'Add New Service'}</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input type="text" placeholder="العنوان عربي" value={form.title} onChange={e => setForm({...form, title: e.target.value})} className="w-full p-2 border rounded-lg" required />
          <input type="text" placeholder="Title English" value={form.titleEn} onChange={e => setForm({...form, titleEn: e.target.value})} className="w-full p-2 border rounded-lg" required />
          <textarea placeholder="الوصف عربي" value={form.description} onChange={e => setForm({...form, description: e.target.value})} className="w-full p-2 border rounded-lg" required />
          <textarea placeholder="Description English" value={form.descriptionEn} onChange={e => setForm({...form, descriptionEn: e.target.value})} className="w-full p-2 border rounded-lg" required />
          <input type="number" step="0.01" placeholder="السعر بالـ Pi" value={form.price} onChange={e => setForm({...form, price: e.target.value})} className="w-full p-2 border rounded-lg" required />
          <select value={form.category} onChange={e => setForm({...form, category: e.target.value})} className="w-full p-2 border rounded-lg">
            <option>تصميم</option>
            <option>كتابة</option>
            <option>برمجة</option>
            <option>منتجات رقمية</option>
          </select>
          <input type="url" placeholder="رابط الصورة" value={form.image} onChange={e => setForm({...form, image: e.target.value})} className="w-full p-2 border rounded-lg" required />
          <div className="flex gap-2 text-sm pt-2">
            <button type="submit" className="flex-1 py-2 bg-primary text-white rounded-lg font-bold">حفظ ونشر</button>
            <button type="button" onClick={onClose} className="flex-1 py-2 border rounded-lg">إلغاء</button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default App

```

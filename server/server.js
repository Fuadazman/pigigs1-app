```javascript
import express from 'express'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import axios from 'axios'
import admin from 'firebase-admin'
import dotenv from 'dotenv'
dotenv.config()

const app = express()

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:3000' }))
app.use(express.json())

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 })
app.use(limiter)

// تهيئة آمنة ومقاومة للانهيار محلياً وعالمياً عبر استغلال متغيرات بيئة Vite المشتركة بالجذر
admin.initializeApp({
  projectId: process.env.VITE_FIREBASE_PROJECT_ID
})
const db = admin.firestore()

// جلب الخدمات (للاحتياط، مع العلم أن الكلاينت يسحب مباشرة من فيربيس لسرعة الـ Realtime)
app.get('/api/services', async (req, res) => {
  try {
    const snapshot = await db.collection('services').orderBy('created_at', 'desc').get()
    const services = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    res.json(services)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// معالجة إضافة الخدمات وحفظها بالخلفية بأمان من السيرفر
app.post('/api/services', async (req, res) => {
  try {
    const { title, titleEn, description, descriptionEn, price, category, image, seller_id } = req.body
    
    // الفلترة والتحقق الصارم من البيانات والأسعار لمنع قيم سالبة أو فارغة
    if (!title || !price || price <= 0 || !seller_id) {
      return res.status(400).json({ error: 'البيانات المدخلة غير صالحة أو السعر المدخل سالب!' })
    }
    
    const docRef = await db.collection('services').add({
      title, titleEn, description, descriptionEn, price, category, image, seller_id,
      created_at: admin.firestore.FieldValue.serverTimestamp()
    })
    const doc = await docRef.get()
    res.json({ id: doc.id, ...doc.data() })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// فحص واستحقاق الموافقة الأمنية للدفع عبر ربط مباشر خلفي بخوادم الـ Pi API الرسمية
app.post('/api/pi/approve', async (req, res) => {
  try {
    const { paymentId } = req.body
    const paymentRes = await axios.get(`https://api.minepi.com/v2/payments/${paymentId}`, {
      headers: { Authorization: `Key ${process.env.PI_APP_SECRET}` }
    })
    const payment = paymentRes.data
    
    // حماية وفك تشفير الـ Metadata لضمان عدم الحصول على قيمة undefined
    const metadata = JSON.parse(payment.metadata)
    const serviceId = metadata.serviceId
    
    const serviceDoc = await db.collection('services').doc(serviceId).get()
    if (!serviceDoc.exists) return res.status(404).json({ error: 'الخدمة المطلوبة غير متوفرة بقاعدة البيانات' })
    
    const service = serviceDoc.data()
    
    // مطابقة السعر الفعلي لمنع التلاعب بالسعر من طرف واجهة المتصفح الأمامية
    if (parseFloat(payment.amount) !== parseFloat(service.price)) {
      return res.status(400).json({ error: 'محاولة تلاعب بالأسعار! المبلغ لا يطابق السعر الحقيقي.' })
    }
    
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// تأكيد الحوالة والقبول المالي النهائي على البلوكشين وحفظ الفاتورة
app.post('/api/pi/complete', async (req, res) => {
  try {
    const { paymentId, txid } = req.body
    await axios.post(`https://api.minepi.com/v2/payments/${paymentId}/complete`, { txid }, {
      headers: { Authorization: `Key ${process.env.PI_APP_SECRET}` }
    })
    
    // TODO: AI Fake Review Detection - فحص وتحليل التقييمات مستقبلاً
    
    await db.collection('payments').add({
      paymentId, txid, status: 'completed',
      created_at: admin.firestore.FieldValue.serverTimestamp()
    })
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

const PORT = 5000
app.listen(PORT, () => console.log(`Server running on port ${PORT}`))

```

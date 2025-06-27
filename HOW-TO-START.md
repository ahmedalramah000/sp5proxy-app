# 🚀 SP5Proxy Desktop - دليل التشغيل

## 📋 **للمستخدم العادي:**

### **Windows Batch (الأسهل):**
```cmd
start-normal.bat
```

### **PowerShell:**
```powershell
.\start-normal.ps1
```

### **Command Line:**
```cmd
npm start
```

---

## 🛠️ **للمطورين والتطوير:**

### **مع DevTools للتطوير:**
```cmd
start.bat
```

### **PowerShell للمطورين:**
```powershell
.\start.ps1
```

### **Manual Development Mode:**
```powershell
$env:SP5PROXY_DEV_MODE=1; $env:SP5PROXY_DEBUG=1; npm start
```

---

## 🔧 **الاختلافات:**

| Script | DevTools | Database | Target User |
|--------|----------|----------|-------------|
| `start-normal.bat` | ❌ لا | ❌ معطل | المستخدم العادي |
| `start.bat` | ✅ نعم | ❌ معطل | المطور |
| `quick-launch.bat` | ✅ نعم | ❌ معطل | التشخيص |

---

## 📝 **ملاحظات:**

- **المستخدم العادي**: استخدم `start-normal.bat` - بدون DevTools
- **المطور**: استخدم `start.bat` - مع DevTools للتطوير  
- **التشخيص**: استخدم `quick-launch.bat` - مع معلومات مفصلة

---

## ✅ **علامات النجاح:**

- ✅ النافذة تظهر خلال 1-2 ثانية
- ✅ واجهة React تحمل بنجاح
- ✅ شريط التحذير يظهر في الأعلى
- ✅ بدون أخطاء sqlite3

---

## 🆘 **في حالة المشاكل:**

1. استخدم `quick-launch.bat` للتشخيص
2. تأكد من وجود Node.js
3. تأكد من وجود `node_modules`
4. جرب `npm install` إذا احتجت

---

**الملفات المطلوبة:**
- ✅ `index-react.html`
- ✅ `dist-react/bundle.js`
- ✅ `node_modules/` 
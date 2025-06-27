# 🚀 SP5Proxy VPS Deployment Guide

## نشر SP5Proxy على Hostinger VPS

### 📋 **معلومات VPS:**
- **IP:** `168.231.82.24`
- **OS:** Ubuntu 22.04 LTS
- **Location:** France - Paris
- **Specs:** 2 CPU cores, 8GB RAM, 100GB Storage
- **SSH:** `ssh root@168.231.82.24`

---

## 🔧 **المرحلة 1: إعداد البيئة المحلية**

### 1. تحضير الملفات للنشر:
```bash
# بناء React application
npm run build-react

# إنشاء نسخة احتياطية
cp package.json package-backup.json
```

### 2. اختبار الاتصال بـ VPS:
```bash
# اختبار SSH connection
ssh root@168.231.82.24

# إذا فشل، قم بإعداد SSH key:
ssh-keygen -t rsa -b 4096
ssh-copy-id root@168.231.82.24
```

---

## 🌐 **المرحلة 2: رفع الملفات إلى VPS**

### 1. جعل سكريبت الرفع قابل للتنفيذ:
```bash
chmod +x upload-to-vps.sh
```

### 2. رفع الملفات:
```bash
./upload-to-vps.sh
```

**أو يدوياً:**
```bash
# رفع الملفات الأساسية
scp -r src/ root@168.231.82.24:/var/www/sp5proxy/
scp -r admin-panel/ root@168.231.82.24:/var/www/sp5proxy/
scp -r dist-react/ root@168.231.82.24:/var/www/sp5proxy/
scp server-web.js root@168.231.82.24:/var/www/sp5proxy/server.js
scp package-web.json root@168.231.82.24:/var/www/sp5proxy/package.json
scp ecosystem.config.js root@168.231.82.24:/var/www/sp5proxy/
scp deploy-to-vps.sh root@168.231.82.24:/var/www/sp5proxy/
```

---

## ⚙️ **المرحلة 3: إعداد VPS**

### 1. الاتصال بـ VPS:
```bash
ssh root@168.231.82.24
```

### 2. تشغيل سكريبت الإعداد:
```bash
cd /var/www/sp5proxy
chmod +x deploy-to-vps.sh
./deploy-to-vps.sh
```

### 3. تثبيت Dependencies:
```bash
cd /var/www/sp5proxy
npm install --production
npm install -g pm2
```

---

## 🚀 **المرحلة 4: تشغيل التطبيق**

### 1. باستخدام PM2 (الطريقة المفضلة):
```bash
# بدء التطبيق
pm2 start ecosystem.config.js

# حفظ التكوين للبدء التلقائي
pm2 save
pm2 startup

# مراقبة التطبيق
pm2 status
pm2 logs
```

### 2. أو باستخدام Node.js مباشرة:
```bash
cd /var/www/sp5proxy
node server.js
```

---

## 🌐 **المرحلة 5: إعداد Nginx**

### 1. تفعيل موقع SP5Proxy:
```bash
sudo ln -sf /etc/nginx/sites-available/sp5proxy /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

### 2. التحقق من حالة Nginx:
```bash
sudo systemctl status nginx
sudo systemctl enable nginx
```

---

## 🔐 **المرحلة 6: الأمان والجدار الناري**

### 1. إعداد UFW Firewall:
```bash
sudo ufw allow 22      # SSH
sudo ufw allow 80      # HTTP
sudo ufw allow 443     # HTTPS
sudo ufw allow 3000    # Main App
sudo ufw allow 3002    # Admin Panel
sudo ufw --force enable
sudo ufw status
```

### 2. تأمين قاعدة البيانات:
```bash
chmod 600 /var/www/sp5proxy/admin-panel/data/sp5proxy.db
chown www-data:www-data /var/www/sp5proxy/admin-panel/data/sp5proxy.db
```

---

## 🌟 **المرحلة 7: الوصول للتطبيق**

### 📱 **التطبيق الرئيسي:**
```
http://168.231.82.24
```

### 🔧 **لوحة الأدمن:**
```
http://168.231.82.24/admin
```

### 📊 **API Status:**
```
http://168.231.82.24/api/status
```

---

## 🛠️ **إدارة التطبيق**

### 1. أوامر PM2 المفيدة:
```bash
# عرض حالة العمليات
pm2 status

# إعادة تشغيل
pm2 restart sp5proxy-web

# إيقاف
pm2 stop sp5proxy-web

# عرض السجلات
pm2 logs sp5proxy-web

# مراقبة الأداء
pm2 monit
```

### 2. مراقبة السجلات:
```bash
# سجلات التطبيق
tail -f /var/www/sp5proxy/logs/sp5proxy-web.log

# سجلات Nginx
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log
```

### 3. التحديثات:
```bash
# إيقاف التطبيق
pm2 stop all

# رفع الملفات الجديدة (من جهازك المحلي)
./upload-to-vps.sh

# إعادة تشغيل التطبيق
ssh root@168.231.82.24 "cd /var/www/sp5proxy && pm2 restart all"
```

---

## 🔍 **استكشاف الأخطاء**

### 1. التحقق من حالة الخدمات:
```bash
# حالة PM2
pm2 status

# حالة Nginx
sudo systemctl status nginx

# حالة الشبكة
netstat -tlnp | grep :3000
netstat -tlnp | grep :80
```

### 2. اختبار الاتصالات:
```bash
# اختبار التطبيق الرئيسي
curl http://localhost:3000/api/status

# اختبار لوحة الأدمن
curl http://localhost:3002/

# اختبار Nginx
curl http://localhost/api/status
```

### 3. مشاكل شائعة:

#### **Port already in use:**
```bash
sudo lsof -ti:3000
sudo kill -9 $(sudo lsof -ti:3000)
```

#### **Permission denied:**
```bash
sudo chown -R www-data:www-data /var/www/sp5proxy
sudo chmod -R 755 /var/www/sp5proxy
```

#### **Database locked:**
```bash
sudo fuser /var/www/sp5proxy/admin-panel/data/sp5proxy.db
sudo pkill -f sp5proxy
```

---

## 📊 **مراقبة الأداء**

### 1. استخدام الموارد:
```bash
# CPU و Memory
htop

# مساحة القرص
df -h

# استخدام الشبكة
iftop
```

### 2. إحصائيات PM2:
```bash
pm2 monit
```

---

## 🆘 **الدعم الفني**

### 🔗 للمساعدة أو الإبلاغ عن مشاكل:
**Telegram Bot:** [@Sp5_ShopBot](https://t.me/Sp5_ShopBot)

### 📝 ملفات السجلات المهمة:
- `/var/www/sp5proxy/logs/sp5proxy-web.log`
- `/var/log/nginx/access.log`
- `/var/log/nginx/error.log`
- `~/.pm2/logs/`

---

## ✅ **قائمة المراجعة**

- [ ] SSH connection working
- [ ] Files uploaded successfully
- [ ] Dependencies installed
- [ ] PM2 processes running
- [ ] Nginx configured and running
- [ ] Firewall configured
- [ ] Main app accessible at http://168.231.82.24
- [ ] Admin panel accessible at http://168.231.82.24/admin
- [ ] API endpoints responding
- [ ] Database permissions set correctly
- [ ] SSL certificate installed (optional)

---

**🎉 تم! SP5Proxy يعمل الآن على VPS بنجاح!** 
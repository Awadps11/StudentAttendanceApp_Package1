# 🧭 Student Attendance Management System
## نظام إدارة الحضور والغياب والتأخر بمدرسة الفاروق بالمظيلف  
حقوق البرمجة: **عوض لافي الزبيدي**

---

## 🧩 Table of Contents / محتوى الوثيقة

1. System Overview / نظرة عامة
2. Project Structure / بنية المشروع
3. References / المراجع (GitHub Repositories)
4. Backend (Node.js + Express)
5. Frontend (HTML, CSS, JavaScript)
6. Database Schema
7. Attendance Logic / منطق الحضور والتأخر
8. Reports & Export / التقارير والتصدير
9. Backup & Restore / النسخ الاحتياطي والاسترجاع
10. Admin Panel / لوحة التحكم
11. ZKTeco Integration / تكامل جهاز البصمة
12. Future Enhancements / التطويرات المستقبلية
13. Development Roadmap / جدول المهام
14. How to Start / كيفية البدء

---

## 1. System Overview / نظرة عامة

This system manages student attendance, delays, and absences using ZKTeco biometric devices.  
يهدف النظام إلى أتمتة عملية تسجيل حضور الطلاب وغيابهم وتأخرهم عبر جهاز البصمة، مع توفير تقارير دقيقة وواجهة عربية بسيطة.

### Key Features / الميزات الرئيسية
- استيراد بيانات الطلاب من ملف Excel.
- حساب التأخر حسب الخطة الدراسية اليومية القابلة للتعديل دون التأثير على الأيام السابقة.
- لوحة تحكم إدارية شاملة.
- تقارير قابلة للتصدير (Excel / PDF).
- نسخ احتياطي تلقائي حسب اليوم والشهر والسنة.
- دعم لغتين (العربية والإنجليزية).
- عرض الحضور والغياب على شكل بطاقات (Cards) ملونة:  
  ✅ الحضور – أخضر، 🔴 الغياب – أحمر، 🟠 التأخر – برتقالي.

---

## 2. Project Structure / بنية المشروع

```
StudentAttendanceApp/
│
├── backend/                # Node.js + Express server
│   ├── controllers/
│   ├── models/
│   ├── routes/
│   ├── utils/
│   └── server.js
│
├── frontend/               # واجهة المستخدم
│   ├── index.html
│   ├── dashboard.html
│   ├── styles.css
│   └── main.js
│
├── data/                   # بيانات العينة وملفات Excel
│   ├── sample_students.xlsx
│   └── mock_attendance.json
│
├── docs/
│   └── StudentAttendanceApp_AI_DevelopmentPrompt.md
│
└── scripts/
    ├── connect_device.js
    ├── mock_device.js
    └── import_students.js
```

---

## 3. References / المراجع

تم الاستفادة من المستودعات التالية لفهم آلية الاتصال بجهاز ZKTeco وطريقة إدارة السجلات:

- https://github.com/bogere/time-attendance  
- https://github.com/mmd-rehan/ADMS-server-ZKTeco  
- https://github.com/coding-libs/zkteco-js  
- https://github.com/fananimi/pyzk  
- https://github.com/adrobinoga/pyzatt  
- https://github.com/mehedijaman/laravel-zkteco  
- https://github.com/hmojicag/NetFrameworkZKTecoAttLogsDemo  
- https://github.com/Awadps11/script-to-system  

---

## 4. Backend (Node.js + Express)

- The backend handles communication with the ZKTeco device via TCP or HTTP.  
- Manages database operations (students, logs, schedules, reports).  
- Provides RESTful API endpoints for frontend consumption.  

**Key modules:**
- `attendanceController.js`: read logs, calculate lateness.  
- `studentController.js`: import Excel and manage records.  
- `reportController.js`: generate and export reports.  

Database options: SQLite (default) or MySQL.

---

## 5. Frontend (HTML, CSS, JS)

- واجهة بسيطة باللغتين العربية والإنجليزية.
- استخدام **Cards Layout** لعرض الطلاب وألوان الحالة.
- دعم الوضع الليلي / الفاتح (Light/Dark mode).
- تصميم مستوحى من Zajel و المدار التقني.

---

## 6. Database Schema

**Tables:**
- `students (id, name, national_id, guardian_phone, class, section)`  
- `attendance_logs (id, student_id, timestamp, status, late_minutes)`  
- `settings (id, key, value)`  
- `backups (id, date, path)`

---

## 7. Attendance Logic / منطق الحضور والتأخر

- يتم تحديد وقت الدخول الرسمي في الإعدادات (مثلاً 07:00 AM).  
- يتم احتساب التأخر لكل يوم بناءً على هذا الوقت دون التأثير على الأيام السابقة.  
- أمثلة:
  - اليوم: وقت الدخول 7:00، الطالب حضر 7:15 → تأخر 15 دقيقة.  
  - غدًا: وقت الدخول 6:45، الطالب حضر 7:00 → تأخر 15 دقيقة.  

---

## 8. Reports & Export / التقارير والتصدير

- Generate detailed reports per student or class.  
- Export to Excel (via **ExcelJS**) or PDF (via **pdfkit**).  
- Include footer with credit:  
  “حقوق البرمجة: عوض لافي الزبيدي – مدرسة الفاروق بالمظيلف”

---

## 9. Backup & Restore

- Daily and monthly automatic backups.  
- Manual export/import supported.  
- حفظ النسخ بصيغة ZIP مع التاريخ.

---

## 10. Admin Panel / لوحة التحكم

- تعديل إعدادات الوقت الرسمي للدخول.  
- إدارة الفصول والشعب.  
- إضافة مدارس جديدة إذا لزم.  
- استعادة النسخ الاحتياطية.

---

## 11. ZKTeco Integration / تكامل جهاز البصمة

Use one of the following libraries to connect:  
- `zkteco-js` (Node.js direct TCP connection)  
- `pyzk` / `pyzatt` (Python bridge if needed)  

**Basic Flow:**  
1. Connect via IP & Port.  
2. Fetch logs (`getAttendanceLogs`).  
3. Store logs in DB.  
4. Calculate lateness and display in dashboard.

---

## 12. Future Enhancements

- Add multi-school management.  
- Add push notifications (absence alerts).  
- Add student photos.  
- Enable cloud sync (Firebase).  

---

## 13. Development Roadmap / جدول المهام

| المرحلة | المهام | الوصف |
|----------|--------|-------|
| 1 | Initialize Node.js Project | إعداد المشروع وتثبيت Express |
| 2 | Build Database | إنشاء جداول الطلاب والحضور |
| 3 | Import Excel | بناء وحدة استيراد بيانات الطلاب |
| 4 | Device Connection | إنشاء خدمة الاتصال بجهاز ZKTeco |
| 5 | Dashboard | بناء واجهة عرض الحضور والغياب |
| 6 | Reports | إنشاء تقارير Excel/PDF |
| 7 | Backup | إعداد النسخ الاحتياطي والاسترجاع |
| 8 | Testing | اختبار النظام |
| 9 | Deploy | نشر النظام محليًا أو على سيرفر |

---

## 14. How to Start / كيفية البدء

1. **Create Project Folder**
   ```bash
   mkdir student-attendance-app
   cd student-attendance-app
   npm init -y
   npm install express sqlite3 exceljs pdfkit
   ```
2. **Build Folder Structure** (as above).  
3. **Create `server.js`** and define API routes.  
4. **Design Frontend** using HTML + CSS + JS.  
5. **Connect to ZKTeco Device** using IP & Port.  
6. **Import Excel students list.**  
7. **Run app**  
   ```bash
   node server.js
   ```

> 💡 *This prompt can be given directly to an AI IDE (e.g., Cursor, v0.dev, Replit AI) to auto-generate the entire system structure and starter code.*

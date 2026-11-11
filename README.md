# 🧊 Rubik Timer & AI Verification Pro (HUST Speedcubing)

🌐 **Live Web App (24/7):** [https://vuathilaivaoe10.github.io/rubik-ai-confused/](https://vuathilaivaoe10.github.io/rubik-ai-confused/)  
📦 **GitHub Repository:** [https://github.com/VuaThiLaiVaoE10/rubik-ai-confused](https://github.com/VuaThiLaiVaoE10/rubik-ai-confused)

Hệ thống bấm giờ Speedcubing chuẩn WCA tích hợp **Trọng tài Camera AI**, **Mô hình 3D tương tác thời gian thực (Three.js)**, **Đấu trường Solo 1v1 P2P (WebRTC)**, **Cổng Chống Bot đa tầng**, và **Bảng Kỷ Lục Toàn Cầu trên Cloud (Supabase PostgreSQL + SHA-256 Anti-Cheat Trigger)**.

---

## ✨ Tính năng nổi bật

1. **⏱️ Đồng hồ Speedcubing chuẩn WCA (`2×2`, `3×3`, `4×4`, `5×5`):**
   - Hỗ trợ đầy đủ 5 chế độ: **Tự do**, **WCA 15s Inspection** (tự động tính phạt `+2` / `DNF`), **Mục tiêu Sub-X**, **Trọng tài AI**, và **Solo 1v1**.
   - Hỗ trợ **StackMat Touchpad** trên điện thoại/máy tính bảng và phím `Spacebar` trên máy tính với phản hồi âm thanh Web Audio API.

2. **🧊 Màn hình Khối 3D AI phía trên & Nhớ màu 6 mặt (`Three.js`):**
   - Quét màu trực tiếp từ Camera qua thuật toán phân loại không gian màu `RGB → HSV` (tự động kiểm tra độ sáng & độ tương phản).
   - Chế độ **🎯 Hiện khi bắt đầu giải** (tự động bung màn hình 3D khi giữ Space/chạm tay chuẩn bị giải và thu gọn khi nghỉ) hoặc **👁️ Luôn hiện**.
   - Tự động lưu nhớ đủ 6 mặt (`U, D, F, B, L, R`) dựa theo viên tâm.

3. **🛡️ Hệ thống Chống Bot & Chống Gian Lận Đa Tầng (Client + Server):**
   - **Tầng Client (`src/utils/antiBot.js` + `HumanCheckModal.jsx`):**
     - Phát hiện trình duyệt tự động (`navigator.webdriver`, CDP/Playwright/Selenium hooks).
     - Kiểm tra sự kiện phần cứng thật (`event.isTrusted === true`).
     - Thử thách xác minh người thật 2 bước (chọn đúng ô màu + nhấn giữ 1.0 giây) khi bắt đầu phiên.
     - Phân tích độ lệch chuẩn hành vi giữ phím và giới hạn thời gian vật lý theo từng khối.
   - **Tầng Server (`src/utils/cloudBackend.js` + `supabase/schema.sql`):**
     - Ký băm `SHA-256` (`proof_hash` 64 ký tự hex) cho mỗi kỷ lục hợp lệ.
     - Trigger PostgreSQL `trg_validate_rubik_solve` trên Supabase kiểm tra chữ ký, trạng thái `camera_verified = true`, và chặn mọi request giả mạo từ bên ngoài.

4. **⚔️ Đấu trường Solo 1v1 Thời gian thực (`WebRTC P2P`):**
   - Kết nối trực tiếp trình duyệt-tới-trình duyệt qua PeerJS Signalling Cloud + Google STUN Server.
   - Đồng bộ cùng công thức Scramble, truyền hình ảnh Camera AI và đồng hồ bấm giờ trực tiếp 24/7 ngay cả khi máy cá nhân của quản trị viên tắt.

5. **📱 Tối ưu Toàn diện cho Mobile & Desktop:**
   - Thanh điều hướng 4 tab cố định dưới đáy màn hình trên Mobile (`Đồng Hồ`, `Lịch Sử`, `Bảng Điểm`, `3D & Cam`).
   - Nút chuyển đổi nhanh **Camera Trước / Camera Sau** (`facingMode`).

---

## 🛠️ Cấu trúc thư mục

```text
rubik-ai-web/
├── src/
│   ├── App.jsx                      # Giao diện trung tâm, WCA Timer, AI Scanner & Admin Panel
│   ├── components/
│   │   ├── Rubik3DView.jsx          # Mô hình Rubik 3D thời gian thực (Three.js)
│   │   ├── Solo1v1Arena.jsx         # Đấu trường P2P WebRTC 1v1
│   │   └── HumanCheckModal.jsx      # Cổng xác minh người thật chống Bot khi bắt đầu giải
│   └── utils/
│       ├── antiBot.js               # Bộ lọc chống Bot, kiểm tra isTrusted & phân tích hành vi
│       └── cloudBackend.js          # Kết nối Supabase Cloud REST API & chữ ký SHA-256
├── supabase/
│   └── schema.sql                   # Cấu trúc bảng PostgreSQL, RLS Policies & Trigger Anti-Cheat
└── vite.config.js                   # Cấu hình Vite build cho GitHub Pages (/rubik-ai-confused/)
```

---

## 🚀 Hướng dẫn chạy локал & Deploy

```bash
# 1. Cài đặt thư viện
npm install

# 2. Chạy máy chủ phát triển (Development)
npm run dev

# 3. Đóng gói bản Production
npm run build
```

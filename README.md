# 🧊 Rubik Timer & AI Verification Pro (HUST Speedcubing)

[![Live Demo](https://img.shields.io/badge/🌐_Live_Web_App-vuathilaivaoe10.github.io-2563eb?style=for-the-badge)](https://vuathilaivaoe10.github.io/rubik-ai-confused/)
[![Supabase Cloud](https://img.shields.io/badge/☁️_Cloud_DB-Supabase_PostgreSQL-10b981?style=for-the-badge)](#4-bảng-xếp-hạng-toàn-cầu-supabase-cloud--anti-cheat-sha-256)
[![WAF & Anti-Bot](https://img.shields.io/badge/🛡️_Security-Smart_Anti--Bot_v2_%2B_WAF-f59e0b?style=for-the-badge)](#3-hệ-thống-phòng-thủ-4-tầng-smart-anti-bot-v2--waf--chống-sập-web)
[![Mobile Ready](https://img.shields.io/badge/📱_Mobile-Android_%26_iOS_Optimized-8b5cf6?style=for-the-badge)](#6-tối-ưu-chuyên-sâu-cho-điện-thoại-android--ios)

> **Trang Web Hoạt Động 24/7:** [https://vuathilaivaoe10.github.io/rubik-ai-confused/](https://vuathilaivaoe10.github.io/rubik-ai-confused/)  
> **Mã Nguồn GitHub:** [https://github.com/VuaThiLaiVaoE10/rubik-ai-confused](https://github.com/VuaThiLaiVaoE10/rubik-ai-confused)

Nền tảng bấm giờ Speedcubing thế hệ mới chuẩn thi đấu quốc tế **WCA** cho 4 khối (**`2×2`**, **`3×3`**, **`4×4`**, **`5×5`**), tích hợp **Trọng tài Camera AI**, **Màn hình Khối 3D tương tác thời gian thực (`Three.js`)**, **Đấu trường Solo 1v1 P2P (`WebRTC`)**, **Khiên Bảo Vệ Smart Anti-Bot v2.0 & Tường lửa WAF**, cùng **Bảng Kỷ Lục Toàn Cầu trên Cloud (`Supabase PostgreSQL`)**.

---

## 📌 Mục Lục

1. [Tổng Quan Các Chế Độ Thi Đấu](#1-tổng-quan-các-chế-độ-thi-đấu)
2. [Màn Hình Khối Rubik 3D Phía Trên & Thị Giác Máy Tính AI](#2-màn-hình-khối-rubik-3d-phía-trên--thị-giác-máy-tính-ai)
3. [Hệ Thống Phòng Thủ 4 Tầng: Smart Anti-Bot v2, WAF & Chống Sập Web](#3-hệ-thống-phòng-thủ-4-tầng-smart-anti-bot-v2--waf--chống-sập-web)
4. [Bảng Xếp Hạng Toàn Cầu (Supabase Cloud & Anti-Cheat SHA-256)](#4-bảng-xếp-hạng-toàn-cầu-supabase-cloud--anti-cheat-sha-256)
5. [Đấu Trường Solo 1v1 Thời Gian Thực (WebRTC P2P)](#5-đấu-trường-solo-1v1-thời-gian-thực-webrtc-p2p)
6. [Tối Ưu Chuyên Sâu Cho Điện Thoại Android & iOS](#6-tối-ưu-chuyên-sâu-cho-điện-thoại-android--ios)
7. [Kiến Trúc Thư Mục Dự Án](#7-kiến-trúc-thư-mục-dự-án)
8. [Hướng Dẫn Cài Đặt, Chạy Local & Triển Khai](#8-hướng-dẫn-cài-đặt-chạy-local--triển-khai)

---

## 1. Tổng Quan Các Chế Độ Thi Đấu

Hệ thống hỗ trợ đầy đủ 4 khối tiêu chuẩn (**2×2 Pocket Cube**, **3×3 Rubik Cube**, **4×4 Rubik's Revenge**, **5×5 Professor's Cube**) với thuật toán sinh công thức tráo (**WCA Scramble Generator**) không lặp trục và 5 chế độ chơi:

| Chế độ | Mô tả cơ chế hoạt động |
| :--- | :--- |
| **🎯 Tự do** | Nhấn giữ `Spacebar` (hoặc bàn đặt tay cảm ứng trên Mobile) chờ đèn xanh lá → thả tay để bắt đầu tính giờ. |
| **🏆 WCA 15s** | Đếm ngược `15 giây Inspection` chuẩn WCA kèm cảnh báo âm thanh; tự động áp dụng phạt **`+2s`** (15s–17s) hoặc **`DNF`** (>17s). |
| **⚡ Mục tiêu Sub-X** | Đặt ngưỡng mục tiêu (`Sub-10s`, `Sub-15s`, `Sub-20s`, `Sub-30s`) và thống kê kết quả vượt mốc ngay sau mỗi lượt giải. |
| **🤖 Trọng tài AI** | Camera AI quét trực tiếp khối Rubik thật, kiểm tra trạng thái đã xáo trộn trước khi giải và tự động xác thực kỷ lục. |
| **⚔️ Solo 1v1** | Tạo phòng mã 4 số hoặc gửi link mời bạn bè thi đấu trực tiếp 1v1 qua mạng ngang hàng **WebRTC P2P**. |

---

## 2. Màn Hình Khối Rubik 3D Phía Trên & Thị Giác Máy Tính AI

- **Phân tích không gian màu `RGB → HSV` (`src/App.jsx`):**
  - Lấy mẫu trực tiếp từ luồng video webcam qua `HTML5 Canvas` trong vùng lưới ngắm trung tâm (`54%` khung hình).
  - Tự động kiểm tra **Độ sáng (`Brightness`)** và **Độ tương phản (`Contrast`)** để chống gian lận che camera hoặc tắt đèn.
- **Màn hình Khối 3D Phía Trên (`src/components/Rubik3DView.jsx`):**
  - Dựng mô hình `N×N×N` bằng **Three.js WebGL** với lõi nhựa đen độ tương phản cao, các miếng dán màu (stickers) nổi 3D và khung viền xanh phát sáng định vị mặt trước đang quét.
  - **Nhớ màu đủ 6 mặt (`scannedFaces`):** Tự động nhận diện màu tâm (`U, D, F, B, L, R`) để lưu và ghép đủ 6 mặt lên mô hình 3D khi người chơi xoay khối Rubik trước camera.
  - **2 Chế độ hiển thị thông minh:**
    - `🎯 Hiện khi bắt đầu giải`: Màn hình 3D tự động bung ra khi giữ phím chuẩn bị giải / đang giải (và giữ lại 3 giây sau khi dừng để đối chiếu kết quả), giúp giao diện luôn gọn gàng lúc nghỉ.
    - `👁️ Luôn hiện 3D`: Hiển thị liên tục màn hình 3D phía trên đồng hồ.

---

## 3. Hệ Thống Phòng Thủ 4 Tầng: Smart Anti-Bot v2, WAF & Chống Sập Web

Để đảm bảo công bằng cho Bảng Kỷ Lục và ngăn chặn các cuộc tấn công làm treo/sập web, dự án được trang bị 4 lớp bảo vệ độc lập:

### Tầng 1: Smart Anti-Bot v2.0 — Phong cách Cloudflare Turnstile (`src/utils/antiBot.js` & `src/components/HumanCheckModal.jsx`)
- **Zero-Friction Passive Telemetry:** Tự động xác minh ngầm trong nền cho người chơi thật dựa trên chuyển động chuột/cảm ứng tự nhiên và sự kiện phần cứng (`event.isTrusted === true`), cấp phiên bảo vệ **24 giờ** mà không làm gián đoạn lúc bấm `Space`.
- **Khiên xác minh 1-chạm & Thanh trượt Rubik:** Chỉ bật hộp thoại xác minh khi phát hiện trình duyệt tự động (`navigator.webdriver`, HeadlessChrome, Selenium/Puppeteer) hoặc mẫu lặp Macro từng mili-giây.

### Tầng 2: Tường Lửa Ứng Dụng Web — WAF & Rate Limiter (`src/utils/securityShield.js`)
- **Lọc nguồn độc (`sanitizeText`, `hasMaliciousPayload`):** Loại bỏ hoàn toàn các chuỗi tấn công `XSS` (`<script>`, `javascript:`, `onerror=`, `onload=`, `eval(`), ký tự điều khiển ẩn và chống `Prototype Pollution` khi đọc JSON.
- **Cầu chì giới hạn tần suất (`checkRateLimit`):** Chặn các đợt spam bấm giờ, brute-force đăng nhập hoặc spam API Cloud bằng thuật toán cửa sổ trượt (Sliding Window) + Cooldown tự động.
- **Tường lửa gói tin WebRTC P2P (`validateP2PPacket`):** Kiểm duyệt kích thước (`<= 2KB`), tần suất (`<= 40 gói/2s`) và kiểu dữ liệu của mọi gói tin từ đối thủ trong chế độ Solo 1v1.

### Tầng 3: Chính Sách Bảo Mật Trình Duyệt (`index.html`)
- Thiết lập `Content-Security-Policy (CSP)` nghiêm ngặt, chỉ cho phép kết nối tới tên miền gốc (`'self'`), Supabase (`*.supabase.co`) và máy chủ tín hiệu PeerJS (`*.peerjs.com`).
- Khóa `object-src 'none'`, `X-Content-Type-Options: nosniff` và `Referrer-Policy: strict-origin-when-cross-origin`.

### Tầng 4: Lá Chắn Chống Sập Runtime (`src/components/SecurityErrorBoundary.jsx`)
- Bọc toàn bộ ứng dụng trong `SecurityErrorBoundary` kết hợp bộ cô lập lỗi bất đồng bộ `unhandledrejection` và `AbortController` (tự ngắt kết nối mạng treo sau `8 giây`), đảm bảo trang web **không bao giờ bị màn hình trắng**.

---

## 4. Bảng Xếp Hạng Toàn Cầu (Supabase Cloud & Anti-Cheat SHA-256)

- **Đồng bộ 24/7 trên Cloud (`src/utils/cloudBackend.js`):**
  - Kết nối trực tiếp tới cụm máy chủ **Supabase PostgreSQL (`ap-southeast-1` Singapore)**.
  - Bảng xếp hạng hoạt động và lưu kỷ lục toàn cầu 24/7 ngay cả khi máy tính cá nhân của quản trị viên tắt hoàn toàn.
- **Chữ ký bảo mật `SHA-256` & Trigger PostgreSQL (`supabase/schema.sql`):**
  - Mỗi lượt giải hợp lệ (có bật Camera AI + vượt qua kiểm tra Anti-Bot) sẽ được băm chữ ký `proof_hash` (64 ký tự hex) bằng Web Crypto API.
  - Hàm Trigger **`validate_rubik_solve_trigger()`** trên Server PostgreSQL tự động từ chối mọi request giả mạo:
    - Bắt buộc `camera_verified = TRUE`.
    - Chặn thời gian phi vật lý theo từng khối (`< 0.45s` với 2×2, `< 2.80s` với 3×3, `< 15.0s` với 4×4, `< 30.0s` với 5×5).
    - Chặn mã độc XSS/Injection và chống Flood/DDoS trực tiếp tại tầng Database (`ANTI_DDOS_REJECTED` / `ANTI_FLOOD_REJECTED`).

---

## 5. Đấu Trường Solo 1v1 Thời Gian Thực (WebRTC P2P)

- Sử dụng **WebRTC DataChannel (`PeerJS`)** kết hợp máy chủ định tuyến **Google STUN (`stun.l.google.com:19302`)**.
- Hai tuyển thủ kết nối trực tiếp trình duyệt-tới-trình duyệt bằng **Mã phòng 4 chữ số** hoặc **Link mời trực tiếp**:
  - Tự động đồng bộ cùng một công thức Scramble cho mỗi hiệp đấu.
  - Hiển thị trực tiếp trạng thái giữ tay (`Đang giữ` / `Sẵn sàng` / `Đang giải`), thời gian chạy theo từng mili-giây và điểm số hiệp đấu.

---

## 6. Tối Ưu Chuyên Sâu Cho Điện Thoại Android & iOS

- **Cuộn trang mượt mà (`touch-action: pan-y` & `-webkit-overflow-scrolling: touch`):**
  - Tự động nhận diện thiết bị cảm ứng Android & iOS (kể cả khi xoay ngang hoặc bật chế độ *Trang web cho máy tính*).
  - Tự động hủy trạng thái giữ đồng hồ nếu ngón tay vuốt quá `12px`, giúp người dùng lướt lên/xuống xem trang mượt mà không bị bấm giờ nhầm.
- **Bàn đặt tay Speedcubing (`🖐️ ĐẶT & GIỮ TAY TẠI ĐÂY ĐỂ GIẢI`) & Thanh điều hướng 4 Tab đáy màn hình:**
  - Chuyển đổi tức thì giữa 4 tab: **`⏱️ Đồng Hồ`**, **`📊 Lịch Sử`**, **`🏆 Bảng Điểm`**, và **`🧊 3D & Cam`**.
  - Hỗ trợ nút chuyển đổi **`🔄 Camera Trước / Camera Sau`** (`facingMode: 'user' | 'environment'`) và cảm ứng xoay khối Rubik 3D `360°` bằng 1 ngón tay, thu phóng bằng 2 ngón tay.

---

## 7. Kiến Trúc Thư Mục Dự Án

```text
rubik-ai-web/
├── index.html                           # Cấu hình CSP, Security Headers & 진입 điểm HTML
├── vite.config.js                       # Cấu hình đóng gói Vite cho GitHub Pages
├── supabase/
│   └── schema.sql                       # Bảng PostgreSQL, RLS Policies & Trigger Anti-Cheat/Anti-DDoS
└── src/
    ├── main.jsx                         # Khởi tạo React Root bọc trong SecurityErrorBoundary
    ├── index.css                        # CSS tối ưu cuộn cảm ứng Android/iOS & vùng xoay 3D
    ├── App.jsx                          # Giao diện trung tâm, WCA Timer, AI Scanner & Admin Panel
    ├── components/
    │   ├── Rubik3DView.jsx              # Mô hình Rubik 3D tương tác thời gian thực (Three.js)
    │   ├── Solo1v1Arena.jsx             # Đấu trường P2P WebRTC 1v1 thời gian thực
    │   ├── HumanCheckModal.jsx          # Khiên xác minh Smart Anti-Bot v2.0 (Turnstile Style)
    │   └── SecurityErrorBoundary.jsx    # Lá chắn chống sập giao diện & tự động phục hồi
    └── utils/
        ├── antiBot.js                   # Sinh trắc học hành vi ngầm (Passive Telemetry) & kiểm tra WCA
        ├── securityShield.js            # Tường lửa WAF, lọc XSS, Rate Limiter & P2P Packet Firewall
        └── cloudBackend.js              # Đồng bộ Supabase Cloud REST API & chữ ký băm SHA-256
```

---

## 8. Hướng Dẫn Cài Đặt, Chạy Local & Triển Khai

### Chạy trên máy cá nhân (Local Development)

```bash
# 1. Di chuyển vào thư mục dự án (trên ổ E: hoặc Desktop)
cd E:\rubik-ai-web

# 2. Cài đặt các gói phụ thuộc
npm install

# 3. Khởi chạy máy chủ phát triển (Vite HMR)
npm run dev
```

### Đóng gói & Cập nhật lên GitHub Pages

```bash
# Đóng gói bản Production vào thư mục dist/
npm run build
```

---

© 2026 **HUST Speedcubing • Rubik Timer & AI Verification Pro**. Thiết kế và phát triển bởi **Khoa (`khoa.tt2611758@sis.hust.edu.vn`)**.

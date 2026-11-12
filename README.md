# 🧊 Rubik Timer & AI Verification Pro (HUST Speedcubing)

[![Live Demo](https://img.shields.io/badge/🌐_Live_Web_App-vuathilaivaoe10.github.io-2563eb?style=for-the-badge)](https://vuathilaivaoe10.github.io/rubik-ai-confused/)
[![Supabase Cloud](https://img.shields.io/badge/☁️_Cloud_DB-Supabase_PostgreSQL-10b981?style=for-the-badge)](#4-bảng-xếp-hạng-toàn-cầu-supabase-cloud--anti-cheat-sha-256)
[![WAF & Anti-Bot](https://img.shields.io/badge/🛡️_Security-Smart_Anti--Bot_v2_%2B_WAF-f59e0b?style=for-the-badge)](#3-hệ-thống-phòng-thủ-4-tầng-smart-anti-bot-v2--waf--chống-sập-web)
[![Mobile Ready](https://img.shields.io/badge/📱_Mobile-Android_%26_iOS_Optimized-8b5cf6?style=for-the-badge)](#6-tối-ưu-chuyên-sâu-cho-điện-thoại-android--ios)

> **Trang Web Hoạt Động 24/7:** [https://vuathilaivaoe10.github.io/rubik-ai-confused/](https://vuathilaivaoe10.github.io/rubik-ai-confused/)  
> **Mã Nguồn GitHub:** [https://github.com/VuaThiLaiVaoE10/rubik-ai-confused](https://github.com/VuaThiLaiVaoE10/rubik-ai-confused)

Nền tảng bấm giờ Speedcubing thế hệ mới chuẩn thi đấu quốc tế **WCA** cho trọn bộ **6 khối chuẩn (`2×2`, `3×3`, `4×4`, `5×5`, `6×6`, `7×7`)** và nhận diện **mọi dòng bề mặt Rubik** (`Phủ Bóng UV / Fluoro`, `Nhựa Nhám Frosted / Stickerless`, `Viền Đen Cổ Điển / Carbon Fiber`, `Pastel / Macaron / Candy`), tích hợp **Trọng tài Camera AI**, **Màn hình Khối 3D tương tác thời gian thực (`Three.js`)**, **Đấu trường Solo 1v1 P2P (`WebRTC`)**, **Khiên Bảo Vệ Smart Anti-Bot v2.0 & Tường lửa WAF**, cùng **Bảng Kỷ Lục Toàn Cầu trên Cloud (`Supabase PostgreSQL`)**.

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

Hệ thống hỗ trợ đầy đủ **6 khối chuẩn WCA** (**`2×2 Pocket Cube`**, **`3×3 Rubik Cube`**, **`4×4 Rubik's Revenge`**, **`5×5 Professor's Cube`**, **`6×6 V-Cube / Big Cube`**, **`7×7 Big Cube`**) với thuật toán sinh công thức tráo (**WCA Scramble Generator** gồm cả ký hiệu `Uw..Bw` và `3Uw..3Bw`) không lặp trục và 5 chế độ chơi:

| Chế độ | Mô tả cơ chế hoạt động |
| :--- | :--- |
| **🎯 Tự do** | Nhấn giữ `Spacebar` (hoặc bàn đặt tay cảm ứng trên Mobile) chờ đèn xanh lá → thả tay để bắt đầu tính giờ. |
| **🏆 WCA 15s** | Đếm ngược `15 giây Inspection` chuẩn WCA kèm cảnh báo âm thanh; tự động áp dụng phạt **`+2s`** (15s–17s) hoặc **`DNF`** (>17s). |
| **⚡ Mục tiêu Sub-X** | Đặt ngưỡng mục tiêu (`Sub-10s`, `Sub-15s`, `Sub-20s`, `Sub-30s`) và thống kê kết quả vượt mốc ngay sau mỗi lượt giải. |
| **🤖 Trọng tài AI** | Camera AI quét trực tiếp khối Rubik thật, kiểm tra trạng thái đã xáo trộn trước khi giải và tự động xác thực kỷ lục. |
| **⚔️ Solo 1v1** | Tạo phòng mã 4 số hoặc gửi link mời bạn bè thi đấu trực tiếp 1v1 qua mạng ngang hàng **WebRTC P2P**. |

---

## 2. Màn Hình Khối Rubik 3D Phía Trên & Thị Giác Máy Tính AI Bám Đuổi Chuyển Động

- **Nhận Diện Đa Hệ Mọi Dòng Bề Mặt Rubik (`CUBE_SURFACE_PROFILES`, `removeUvSpecularGlare`, `rgbToLab`, & `Dual-Ring Sampling`):**
  - **✨ Tự động AI (Mọi loại):** Tự động kết hợp không gian màu `HSV` + `CIE L*a*b*` + khử lóa `UV` + lấy mẫu 2 vòng đồng tâm để nhận diện mọi dòng Rubik mà không cần chỉnh tay.
  - **💎 Phủ Bóng UV / Fluoro (`GAN UV`, `Moyu Weilong UV`, `X-Man Tornado UV`):** Sử dụng mô hình phản xạ lưỡng sắc (*Dichromatic Reflection Model*) và khử điểm chói sáng trắng (*Specular Highlight Stripping* + *2nd-Pass Glare Recovery*) để khôi phục màu gốc bị bóng đèn trần hoặc ánh nắng làm lóa trắng.
  - **🧊 Nhựa Nhám / Stickerless (`RS3M`, `QiYi`, `YJ Frosted`):** Tự động khuếch đại độ bão hòa màu tán xạ (`satScale`) và phân tích trục đối kháng màu `CIE L*a*b* (a*, b*)`.
  - **⬛ Viền Đen Cổ Điển / Carbon Fiber (`Stickered Black-Border` & `Carbon Fiber`):** Sử dụng thuật toán **Lấy mẫu 2 vòng đồng tâm (`Dual-Ring Core + Outer-Ring Sampling`)** để đọc chính xác dải màu viền ngoài ngay cả khi tâm viên dán vân Carbon đen.
  - **🍬 Pastel / Macaron / Candy (`Meilong Macaron`, `Qiyi Jelly`):** Phân biệt chính xác các tông màu kem nhạt (Hồng Pastel, Vàng chanh nhạt, Xanh Mint, Xanh Baby) khỏi màu Trắng nhờ ngưỡng `Chroma L*a*b*`.
- **Nhận Diện Toàn Diện Các Mặt Chưa Giải (2–6 Màu) & Mô Phỏng 6 Mặt Xáo Trộn Trên 3D (`buildScrambledFaces` & `evaluateRubikGridCandidate`):**
  - **Mô hình 3D 6 mặt xáo trộn theo Scramble thực tế (`buildScrambledFaces` trong `src/components/Rubik3DView.jsx`):** Ngay từ khi khởi tạo, cả 6 mặt (`U, D, L, R, F, B`) trên mô hình 3D đều hiển thị trạng thái **chưa giải (đã xáo trộn)** khớp với công thức Scramble hiện tại thay vì tô 1 màu đồng nhất.
  - **Thuật toán lấy mẫu lõi trung vị (`Trimmed Inner-Core Sampling`):** Lấy mẫu lõi trung tâm `11%` của từng ô sticker và tự động lọc bỏ 20% điểm tối ở rãnh nhựa đen + 15% điểm chói sáng. Nhờ đó, khi các ô màu khác nhau nằm sát cạnh nhau trên **mặt chưa giải**, AI vẫn phân tách chuẩn xác từng màu mà không bị lem màu giữa các viên.
  - **Ưu tiên khóa mục tiêu Mặt Chưa Giải (`unsolvedBonus`) & Dải trạng thái 6 mặt (`U, D, F, B, L, R`):** Nhận diện nhạy mọi trạng thái mặt chưa giải (từ mặt mới xáo trộn 3–6 màu đến mặt đang giải dở 2 màu), cập nhật trực tiếp lên từng mặt của khối 3D và hiển thị thanh trạng thái 6 mặt trực quan (`F:4m`, `R:5m` = mặt chưa giải có 4–5 màu; `U:✓` = mặt đã giải).
- **Bám đuổi chuyển động đa vùng & đa tỷ lệ (`locateDynamicRubikBox` trong `src/App.jsx`):**
  - Quét **Heatmap cụm màu sticker** toàn khung hình kết hợp **Kalman/EMA Velocity Prediction** (dự đoán quỹ đạo di chuyển tay) và các vùng tìm kiếm đa tỷ lệ (trái/phải/trên/dưới, xa/gần).
  - Khung lưới ngắm AI tự động di chuyển bám theo khối Rubik (`🎯 Đang bám (X%, Y%)`) ngay cả khi người chơi vung tay hoặc lật khối.
  - **Khử nhòe chuyển động 3 khung hình (`3-Frame Temporal Motion Stabilizer`):** Tự động khôi phục các ô bị nhòe nhẹ khi di chuyển nhanh để chiếu chính xác lên mô hình 3D.
- **Bộ lọc Chống Gian Lận Vật Thể Thường / Da Người / Tường (`isSkinOrWoodTone` & `classifyRubikStickerCell`):**
  - Kiểm tra tỷ lệ sắc thái da người/gỗ trên toàn lưới (`skinLikeCellsCount`), biên độ chuyển màu sắc nét giữa các viên kề nhau (`sharpAdjacentEdges`, `colorTransitions`) và độ tương phản rãnh nhựa (`gridSeamContrast`), loại bỏ 100% trường hợp quay camera vào mặt người, bàn tay, quần áo hoặc tường trống.
- **Khóa Đồng Hồ Bắt Buộc Camera AI & Phân Tích Lên Mô Hình 3D (`requireCameraAndCubeToSolve`):**
  - **Đồng hồ mặc định khóa (`🔒 ĐỒNG HỒ ĐANG KHÓA`)** khi chưa bật Camera hoặc chưa đưa mặt Rubik chưa giải vào xác minh trên Mô hình 3D (áp dụng cho cả phím `Spacebar`, bàn chạm Mobile và chế độ Solo 1v1).
  - Nếu người chơi tắt Camera giữa chừng khi đang giải, hệ thống lập tức hủy lượt giải.
  - Trong lúc giải, Camera AI bắt buộc phải ghi nhận sự biến đổi trạng thái xoay khối Rubik thật (`cubeStateChanged = true`, `cubeMovesSeen >= 2`) mới công nhận kết quả vào Lịch sử (`PB`, `Ao5`, `Ao12`) và Bảng Kỷ Lục.
- **Trung Tâm Quản Trị Độc Quyền Super-Admin (`khoa.tt2611758@sis.hust.edu.vn`):**
  - Hoàn toàn ẩn 100% đối với người chơi thông thường; tự động kích hoạt khi đăng nhập bằng Gmail quản trị viên của Khoa.
  - Cho phép thêm/sửa/xóa trực tiếp kỷ lục tuyển thủ trên cả Local & Supabase Cloud, đổi tên bảng đấu, ghim thông báo giải đấu đầu trang, mở khóa nhanh khối 3D và bật/tắt linh hoạt từng quy tắc thi đấu (bắt buộc Camera, xác minh 3D, tự động dừng đồng hồ, đặc quyền VIP Bypass).

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

- **Cuộn trang mượt mà 2 chiều (`touch-action: pan-x pan-y` & `-webkit-overflow-scrolling: touch`):**
  - Tự động nhận diện thiết bị cảm ứng Android & iOS (kể cả khi xoay ngang hoặc bật chế độ *Trang web cho máy tính*).
  - Tự động hủy trạng thái giữ đồng hồ nếu ngón tay vuốt quá `12px`, giúp người dùng lướt lên/xuống xem trang mượt mà không bị bấm giờ nhầm.
- **Thanh Header tự động xuống dòng (`flex-wrap`) & Thanh điều hướng 5 Tab đáy màn hình:**
  - Chuyển đổi tức thì giữa 5 mục: **`⏱️ Đồng Hồ`**, **`📊 Lịch Sử`**, **`🏆 Bảng Điểm`**, **`🧊 3D & Cam`**, và **`👤 Đăng Nhập / Tài Khoản`**.
  - Nút mở khóa nhanh **`📷 BẬT CAMERA AI ĐỂ MỞ KHÓA ĐỒNG HỒ`**, nút chuyển đổi **`🔄 Camera Trước / Camera Sau`** (`facingMode: 'user' | 'environment'`) và cảm ứng xoay khối Rubik 3D `360°` bằng 1 ngón tay, thu phóng bằng 2 ngón tay.

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

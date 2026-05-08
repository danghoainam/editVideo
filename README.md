# Video Editor Tool (Anti-Copyright)

Công cụ chỉnh sửa video tự động để tránh bản quyền và tạo nội dung mới.

## Tính năng
- **Lật video (Mirror):** Tránh bị quét bản quyền bằng cách lật ngược hình ảnh.
- **Zoom & Crop:** Tự động cắt và phóng to vào chi tiết.
- **Chỉnh màu (Color Grading):** Thay đổi độ sáng, tương phản, độ bão hòa.
- **Thay đổi tốc độ:** Làm nhanh hoặc chậm video.
- **Chèn Overlay:** Thêm logo, watermark hoặc khung viền.
- **Xử lý âm thanh:** 
    - Tắt âm thanh gốc hoàn toàn.
    - Chèn thêm các hiệu ứng âm thanh (SFX) tại các thời điểm mong muốn.

## Cách sử dụng

1. **Chuẩn bị:**
   - Cài đặt Node.js nếu chưa có.
   - Chạy lệnh `npm install` để cài đặt thư viện cần thiết.
   - Copy video cần sửa vào thư mục `input/` (mặc định đặt tên là `video.mp4`).

2. **Cấu hình:**
   - Chỉnh sửa file `config.json` để thay đổi các thông số:
     - `mirror`: `true` hoặc `false`.
     - `zoom`: Tỉ lệ zoom (ví dụ: `1.1` là zoom 10%).
     - `speed`: Tốc độ (ví dụ: `1.2` là nhanh hơn 20%).
     - `color`: Chỉnh `brightness`, `contrast`, `saturation`.
     - `overlay`: Đường dẫn đến file ảnh logo/khung và vị trí.
     - `sfx`: Danh sách các hiệu ứng âm thanh và thời gian bắt đầu (giây).

3. **Chạy tool:**
   - Mở terminal tại thư mục này và chạy:
     ```bash
     node index.js
     ```
   - Video kết quả sẽ nằm trong thư mục `output/`.

## Cấu trúc thư mục
- `input/`: Nơi chứa video gốc.
- `output/`: Nơi chứa video sau khi xử lý.
- `assets/`: 
  - `overlays/`: Chứa logo, khung viền.
  - `sfx/`: Chứa các file âm thanh (mp3, wav).
- `index.js`: File logic chính.
- `config.json`: File cài đặt thông số.

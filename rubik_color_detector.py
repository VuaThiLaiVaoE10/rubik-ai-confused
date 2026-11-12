import cv2
import numpy as np


# Hue trong OpenCV nam trong khoang 0-179.
# Co the dieu chinh cac nguong nay de phu hop voi camera va anh sang.
def nhan_dien_mau(hsv):
    h, s, v = [int(gia_tri) for gia_tri in hsv]

    if v < 45:
        return "?"

    if s < 60 and v >= 140:
        return "Trang"

    if s < 60:
        return "?"

    if h <= 8 or h >= 170:
        return "Do"
    if 9 <= h <= 22:
        return "Cam"
    if 23 <= h <= 35:
        return "Vang"
    if 36 <= h <= 85:
        return "Xanh la"
    if 86 <= h <= 130:
        return "Xanh duong"

    return "?"


def lay_mau_trung_vi(vung_bgr):
    vung_hsv = cv2.cvtColor(vung_bgr, cv2.COLOR_BGR2HSV)
    return np.median(vung_hsv.reshape(-1, 3), axis=0)


def main():
    camera = cv2.VideoCapture(0)
    camera.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    camera.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

    if not camera.isOpened():
        raise RuntimeError("Khong the mo webcam. Hay kiem tra quyen truy cap camera.")

    ten_cua_so = "Nhan dien mau Rubik 3x3"
    kich_thuoc_o = 100

    print("Dat mot mat Rubik vao khung 3x3.")
    print("Nhan Space de in ma tran mau, Q hoac Esc de thoat.")

    while True:
        thanh_cong, khung_hinh = camera.read()
        if not thanh_cong:
            print("Khong doc duoc hinh anh tu webcam.")
            break

        chieu_cao, chieu_rong = khung_hinh.shape[:2]
        kich_thuoc_luoi = kich_thuoc_o * 3
        x_bat_dau = (chieu_rong - kich_thuoc_luoi) // 2
        y_bat_dau = (chieu_cao - kich_thuoc_luoi) // 2

        ma_tran_mau = []

        for hang in range(3):
            dong_mau = []

            for cot in range(3):
                x1 = x_bat_dau + cot * kich_thuoc_o
                y1 = y_bat_dau + hang * kich_thuoc_o
                x2 = x1 + kich_thuoc_o
                y2 = y1 + kich_thuoc_o

                # Chi lay vung nho o giua moi o, tranh dinh vien va duong ke.
                le = 35
                vung_mau = khung_hinh[y1 + le:y2 - le, x1 + le:x2 - le]

                if vung_mau.size == 0:
                    ten_mau = "?"
                else:
                    mau_hsv = lay_mau_trung_vi(vung_mau)
                    ten_mau = nhan_dien_mau(mau_hsv)

                dong_mau.append(ten_mau)

                cv2.rectangle(khung_hinh, (x1, y1), (x2, y2), (255, 255, 255), 2)
                cv2.rectangle(
                    khung_hinh,
                    (x1 + le, y1 + le),
                    (x2 - le, y2 - le),
                    (0, 255, 255),
                    1,
                )
                cv2.putText(
                    khung_hinh,
                    ten_mau,
                    (x1 + 5, y1 + 22),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.48,
                    (0, 0, 0),
                    3,
                    cv2.LINE_AA,
                )
                cv2.putText(
                    khung_hinh,
                    ten_mau,
                    (x1 + 5, y1 + 22),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.48,
                    (255, 255, 255),
                    1,
                    cv2.LINE_AA,
                )

            ma_tran_mau.append(dong_mau)

        cv2.putText(
            khung_hinh,
            "Space: in mau | Q/Esc: thoat",
            (10, 25),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.55,
            (255, 255, 255),
            2,
            cv2.LINE_AA,
        )
        cv2.imshow(ten_cua_so, khung_hinh)

        phim = cv2.waitKey(1) & 0xFF
        if phim == ord(" "):
            print("\nMa tran mau:")
            for dong in ma_tran_mau:
                print(dong)
        elif phim in (ord("q"), 27):
            break

        # Thoat khi nguoi dung bam nut X cua cua so.
        if cv2.getWindowProperty(ten_cua_so, cv2.WND_PROP_VISIBLE) < 1:
            break

    camera.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()

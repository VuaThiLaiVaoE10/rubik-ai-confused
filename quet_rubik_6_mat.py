import json
import os
import time
from pathlib import Path

import cv2
import numpy as np


# Thu tu U, R, F, D, L, B thuong duoc dung trong cac bo giai Rubik.
MAT = (
    ("U", "Tren"),
    ("R", "Phai"),
    ("F", "Truoc"),
    ("D", "Duoi"),
    ("L", "Trai"),
    ("B", "Sau"),
)
TEN_MAU = ("Do", "Cam", "Vang", "Xanh la", "Xanh duong", "Trang")
DUONG_DAN_KET_QUA = Path(__file__).with_name("trang_thai_rubik_6_mat.json")


def nhan_dien_mau(hsv):
    """Nhan dien 6 mau Rubik bang nguong HSV trong OpenCV."""
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
    """Lay trung vi tung kenh HSV de giam nhieu, bong toi va diem cho i sang."""
    vung_hsv = cv2.cvtColor(vung_bgr, cv2.COLOR_BGR2HSV)
    return np.median(vung_hsv.reshape(-1, 3), axis=0)


def vi_tri_luoi(chieu_rong, chieu_cao):
    kich_thuoc_o = max(
        60,
        min(105, (chieu_cao - 180) // 3, (chieu_rong - 30) // 3),
    )
    kich_thuoc_luoi = kich_thuoc_o * 3
    x_bat_dau = (chieu_rong - kich_thuoc_luoi) // 2
    y_bat_dau = (chieu_cao - kich_thuoc_luoi) // 2 + 25
    return x_bat_dau, y_bat_dau, kich_thuoc_o


def quet_luoi(khung_hinh, x_bat_dau, y_bat_dau, kich_thuoc_o):
    """Doc mau va HSV cua 9 o, khong thay doi khung hinh dau vao."""
    ma_tran_mau = []
    ma_tran_hsv = []
    le = max(15, int(kich_thuoc_o * 0.34))

    for hang in range(3):
        dong_mau = []
        dong_hsv = []

        for cot in range(3):
            x1 = x_bat_dau + cot * kich_thuoc_o
            y1 = y_bat_dau + hang * kich_thuoc_o
            x2 = x1 + kich_thuoc_o
            y2 = y1 + kich_thuoc_o
            vung_mau = khung_hinh[y1 + le:y2 - le, x1 + le:x2 - le]

            if vung_mau.size == 0:
                mau_hsv = np.array([0, 0, 0])
                ten_mau = "?"
            else:
                mau_hsv = lay_mau_trung_vi(vung_mau)
                ten_mau = nhan_dien_mau(mau_hsv)

            dong_mau.append(ten_mau)
            dong_hsv.append([int(x) for x in mau_hsv])

        ma_tran_mau.append(dong_mau)
        ma_tran_hsv.append(dong_hsv)

    return ma_tran_mau, ma_tran_hsv


def viet_chu(khung_hinh, chu, vi_tri, ti_le=0.48, mau=(255, 255, 255), do_day=1):
    x, y = vi_tri
    cv2.putText(
        khung_hinh,
        chu,
        (x, y),
        cv2.FONT_HERSHEY_SIMPLEX,
        ti_le,
        (0, 0, 0),
        do_day + 2,
        cv2.LINE_AA,
    )
    cv2.putText(
        khung_hinh,
        chu,
        (x, y),
        cv2.FONT_HERSHEY_SIMPLEX,
        ti_le,
        mau,
        do_day,
        cv2.LINE_AA,
    )


def ve_luoi(
    khung_hinh,
    ma_tran_mau,
    ma_tran_hsv,
    x_bat_dau,
    y_bat_dau,
    kich_thuoc_o,
    hien_hsv,
):
    le = max(15, int(kich_thuoc_o * 0.34))

    for hang in range(3):
        for cot in range(3):
            x1 = x_bat_dau + cot * kich_thuoc_o
            y1 = y_bat_dau + hang * kich_thuoc_o
            x2 = x1 + kich_thuoc_o
            y2 = y1 + kich_thuoc_o

            cv2.rectangle(khung_hinh, (x1, y1), (x2, y2), (255, 255, 255), 2)
            cv2.rectangle(
                khung_hinh,
                (x1 + le, y1 + le),
                (x2 - le, y2 - le),
                (0, 255, 255),
                1,
            )
            viet_chu(
                khung_hinh,
                ma_tran_mau[hang][cot],
                (x1 + 4, y1 + 19),
                ti_le=0.43,
            )

            if hien_hsv:
                h, s, v = ma_tran_hsv[hang][cot]
                viet_chu(
                    khung_hinh,
                    f"H{h} S{s} V{v}",
                    (x1 + 3, y2 - 7),
                    ti_le=0.35,
                )


def dem_mau(ket_qua):
    dem = {ten_mau: 0 for ten_mau in TEN_MAU}

    for ma_mat, _ in MAT:
        ma_tran = ket_qua.get(ma_mat)
        if ma_tran is None:
            continue
        for dong in ma_tran:
            for ten_mau in dong:
                if ten_mau in dem:
                    dem[ten_mau] += 1

    return dem


def kiem_tra_hop_le(ket_qua):
    da_du_6_mat = all(ket_qua.get(ma_mat) is not None for ma_mat, _ in MAT)
    dem = dem_mau(ket_qua)
    return da_du_6_mat and all(dem[ten_mau] == 9 for ten_mau in TEN_MAU)


def giai_kociemba(ket_qua):
    """Giai Rubik 6 mat toi uu bang Kociemba Two-Phase Algorithm."""
    try:
        import subprocess
        center_map = {
            ket_qua["U"][1][1]: "U",
            ket_qua["R"][1][1]: "R",
            ket_qua["F"][1][1]: "F",
            ket_qua["D"][1][1]: "D",
            ket_qua["L"][1][1]: "L",
            ket_qua["B"][1][1]: "B",
        }
        cube_str = ""
        for ma_mat, _ in MAT:
            for hang in ket_qua[ma_mat]:
                for mau in hang:
                    cube_str += center_map.get(mau, "?")

        if len(cube_str) == 54 and "?" not in cube_str:
            cli_path = Path(__file__).with_name("kociemba_cli.cjs")
            cmd = ["node", str(cli_path), cube_str]
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=8)
            if res.returncode == 0 and res.stdout.strip():
                return json.loads(res.stdout.strip())
    except Exception as e:
        return {"success": False, "error": str(e)}
    return None


def luu_ket_qua(ket_qua, duong_dan=DUONG_DAN_KET_QUA):
    duong_dan = Path(duong_dan)
    kociemba_res = None
    if kiem_tra_hop_le(ket_qua):
        kociemba_res = giai_kociemba(ket_qua)

    du_lieu = {
        "thu_tu_mat": [ma_mat for ma_mat, _ in MAT],
        "cac_mat": ket_qua,
        "thong_ke_mau": dem_mau(ket_qua),
        "hop_le": kiem_tra_hop_le(ket_qua),
        "kociemba": kociemba_res,
    }

    with duong_dan.open("w", encoding="utf-8") as tep:
        json.dump(du_lieu, tep, ensure_ascii=False, indent=2)

    return du_lieu


def in_ket_qua(ket_qua):
    for ma_mat, ten_mat in MAT:
        print(f"\n{ma_mat} - {ten_mat}:")
        ma_tran = ket_qua.get(ma_mat)
        if ma_tran is None:
            print("Chua quet")
        else:
            for dong in ma_tran:
                print(dong)

    print("\nThong ke mau:", dem_mau(ket_qua))
    print("Hop le:", kiem_tra_hop_le(ket_qua))


def tim_mat_tiep_theo(ket_qua, mat_hien_tai):
    for buoc in range(1, len(MAT) + 1):
        chi_so = (mat_hien_tai + buoc) % len(MAT)
        if ket_qua[MAT[chi_so][0]] is None:
            return chi_so
    return mat_hien_tai


def mo_camera():
    if os.name == "nt":
        camera = cv2.VideoCapture(0, cv2.CAP_DSHOW)
        if camera.isOpened():
            return camera
        camera.release()
    return cv2.VideoCapture(0)


def main():
    ket_qua = {ma_mat: None for ma_mat, _ in MAT}
    mat_hien_tai = 0
    hien_hsv = False
    thong_bao = ""
    thong_bao_den = 0.0

    camera = mo_camera()
    camera.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    camera.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    camera.set(cv2.CAP_PROP_BUFFERSIZE, 1)

    if not camera.isOpened():
        raise RuntimeError("Khong the mo webcam. Hay kiem tra quyen truy cap camera.")

    ten_cua_so = "Quet Rubik 6 mat"
    print("Thu tu mac dinh: U=Tren, R=Phai, F=Truoc, D=Duoi, L=Trai, B=Sau.")
    print("Dat mat can quet song song voi camera va khop 9 mieng mau vao luoi 3x3.")
    print("Space: luu mat | 1-6: chon mat | H: HSV | S: luu/in | Q: thoat.")

    while True:
        thanh_cong, khung_hinh = camera.read()
        if not thanh_cong:
            print("Khong doc duoc hinh anh tu webcam.")
            break

        chieu_cao, chieu_rong = khung_hinh.shape[:2]
        x_bat_dau, y_bat_dau, kich_thuoc_o = vi_tri_luoi(chieu_rong, chieu_cao)
        ma_tran_mau, ma_tran_hsv = quet_luoi(
            khung_hinh,
            x_bat_dau,
            y_bat_dau,
            kich_thuoc_o,
        )
        ve_luoi(
            khung_hinh,
            ma_tran_mau,
            ma_tran_hsv,
            x_bat_dau,
            y_bat_dau,
            kich_thuoc_o,
            hien_hsv,
        )

        ma_mat, ten_mat = MAT[mat_hien_tai]
        so_mat_da_quet = sum(ket_qua[ma] is not None for ma, _ in MAT)
        tien_do = " ".join(
            f"[x]{ma}" if ket_qua[ma] is not None else f"[ ]{ma}" for ma, _ in MAT
        )

        viet_chu(
            khung_hinh,
            f"Dang quet: {ma_mat} - {ten_mat} | Da luu: {so_mat_da_quet}/6",
            (10, 20),
            ti_le=0.52,
            mau=(0, 255, 0),
        )
        viet_chu(
            khung_hinh,
            "Space: luu | 1-6: chon mat | H: HSV | S: luu/in | Q: thoat",
            (10, 42),
            ti_le=0.42,
        )
        viet_chu(khung_hinh, tien_do, (10, 64), ti_le=0.46, mau=(0, 255, 255))
        viet_chu(
            khung_hinh,
            "U:Tren R:Phai F:Truoc D:Duoi L:Trai B:Sau",
            (10, 84),
            ti_le=0.40,
        )

        if time.monotonic() < thong_bao_den:
            viet_chu(
                khung_hinh,
                thong_bao,
                (10, chieu_cao - 15),
                ti_le=0.45,
                mau=(0, 220, 255),
            )

        cv2.imshow(ten_cua_so, khung_hinh)
        phim = cv2.waitKey(1) & 0xFF

        if ord("1") <= phim <= ord("6"):
            mat_hien_tai = phim - ord("1")
            ma_mat, ten_mat = MAT[mat_hien_tai]
            thong_bao = f"Da chon {ma_mat} - {ten_mat}. Space de quet hoac quet lai."
            thong_bao_den = time.monotonic() + 2.0

        elif phim == ord(" "):
            cac_o_loi = [
                (hang, cot)
                for hang in range(3)
                for cot in range(3)
                if ma_tran_mau[hang][cot] == "?"
            ]

            if cac_o_loi:
                thong_bao = "Con o chua ro mau. Hay chinh anh sang hoac nguong HSV."
                print("\nChua luu vi co o khong nhan dien duoc:")
                for hang, cot in cac_o_loi:
                    print(
                        f"O ({hang + 1}, {cot + 1}) - HSV:",
                        ma_tran_hsv[hang][cot],
                    )
            else:
                ma_mat, ten_mat = MAT[mat_hien_tai]
                ket_qua[ma_mat] = [dong[:] for dong in ma_tran_mau]

                print(f"\nDa luu {ma_mat} - {ten_mat}:")
                for dong in ma_tran_mau:
                    print(dong)
                print("HSV cua 9 o:")
                for dong in ma_tran_hsv:
                    print(dong)

                du_lieu = luu_ket_qua(ket_qua)
                if all(ket_qua[ma] is not None for ma, _ in MAT):
                    kociemba_info = du_lieu.get("kociemba")
                    if du_lieu["hop_le"]:
                        if kociemba_info and kociemba_info.get("success"):
                            sol = kociemba_info["solution"]
                            cnt = kociemba_info["moveCount"]
                            thong_bao = f"Kociemba ({cnt}b): {sol[:24]}..."
                            print("\n" + "=" * 55)
                            print(f"⚡ NGHIEM GIAI TOI UU KOCIEMBA ({cnt} buoc):")
                            print(f"👉 {sol}")
                            print("=" * 55 + "\n")
                        else:
                            thong_bao = "Du 6 mat: moi mau xuat hien dung 9 lan."
                    else:
                        thong_bao = "Du 6 mat nhung so mau sai. Bam S de xem thong ke."
                    print("Thong ke mau:", du_lieu["thong_ke_mau"])
                    print("Hop le:", du_lieu["hop_le"])
                else:
                    thong_bao = f"Da luu {ma_mat} - {ten_mat}."

                print("Da ghi:", DUONG_DAN_KET_QUA)
                mat_hien_tai = tim_mat_tiep_theo(ket_qua, mat_hien_tai)

            thong_bao_den = time.monotonic() + 4.0

        elif phim == ord("h"):
            hien_hsv = not hien_hsv

        elif phim == ord("s"):
            luu_ket_qua(ket_qua)
            in_ket_qua(ket_qua)
            thong_bao = f"Da ghi {DUONG_DAN_KET_QUA.name}"
            thong_bao_den = time.monotonic() + 3.0

        elif phim in (ord("q"), 27):
            break

        if cv2.getWindowProperty(ten_cua_so, cv2.WND_PROP_VISIBLE) < 1:
            break

    camera.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()

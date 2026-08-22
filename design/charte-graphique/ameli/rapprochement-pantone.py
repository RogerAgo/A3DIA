# -*- coding: utf-8 -*-
"""Rapprochement Pantone (Solid Coated) des couleurs extraites du dossier ameli.
Les hex Pantone sont des conversions sRGB indicatives : a revalider sur nuancier physique."""
import math

# --- conversions ---------------------------------------------------------
def srgb_to_lab(rgb):
    def f(c):
        c /= 255.0
        return c/12.92 if c <= 0.04045 else ((c+0.055)/1.055)**2.4
    r,g,b = map(f, rgb)
    X = r*0.4124564+g*0.3575761+b*0.1804375
    Y = r*0.2126729+g*0.7151522+b*0.0721750
    Z = r*0.0193339+g*0.1191920+b*0.9503041
    Xn,Yn,Zn = 0.95047,1.0,1.08883
    def g_(t): return t**(1/3) if t > 0.008856 else 7.787*t+16/116
    fx,fy,fz = g_(X/Xn), g_(Y/Yn), g_(Z/Zn)
    return (116*fy-16, 500*(fx-fy), 200*(fy-fz))

def ciede2000(l1, l2):
    L1,a1,b1 = l1; L2,a2,b2 = l2
    C1 = math.hypot(a1,b1); C2 = math.hypot(a2,b2); Cb = (C1+C2)/2
    G = 0.5*(1-math.sqrt(Cb**7/(Cb**7+25**7))) if Cb > 0 else 0
    a1p,a2p = (1+G)*a1, (1+G)*a2
    C1p,C2p = math.hypot(a1p,b1), math.hypot(a2p,b2)
    h1p = math.degrees(math.atan2(b1,a1p)) % 360
    h2p = math.degrees(math.atan2(b2,a2p)) % 360
    dLp = L2-L1; dCp = C2p-C1p
    if C1p*C2p == 0: dhp = 0
    elif abs(h2p-h1p) <= 180: dhp = h2p-h1p
    elif h2p-h1p > 180: dhp = h2p-h1p-360
    else: dhp = h2p-h1p+360
    dHp = 2*math.sqrt(C1p*C2p)*math.sin(math.radians(dhp)/2)
    Lbp = (L1+L2)/2; Cbp = (C1p+C2p)/2
    if C1p*C2p == 0: hbp = h1p+h2p
    elif abs(h1p-h2p) <= 180: hbp = (h1p+h2p)/2
    elif h1p+h2p < 360: hbp = (h1p+h2p+360)/2
    else: hbp = (h1p+h2p-360)/2
    T = (1-0.17*math.cos(math.radians(hbp-30))+0.24*math.cos(math.radians(2*hbp))
         +0.32*math.cos(math.radians(3*hbp+6))-0.20*math.cos(math.radians(4*hbp-63)))
    dTh = 30*math.exp(-(((hbp-275)/25)**2))
    Rc = 2*math.sqrt(Cbp**7/(Cbp**7+25**7))
    Sl = 1+(0.015*(Lbp-50)**2)/math.sqrt(20+(Lbp-50)**2)
    Sc = 1+0.045*Cbp; Sh = 1+0.015*Cbp*T
    Rt = -math.sin(math.radians(2*dTh))*Rc
    return math.sqrt((dLp/Sl)**2+(dCp/Sc)**2+(dHp/Sh)**2+Rt*(dCp/Sc)*(dHp/Sh))

hx = lambda s: tuple(int(s[i:i+2],16) for i in (1,3,5))

# --- couleurs relevees dans le dossier ameli ------------------------------
TARGETS = {
    "Ivoire ameli":      "#FFF9F1",
    "Bleu periwinkle":   "#CFDEFF",
    "Taupe chaud":       "#8E837D",
    "Nude terracotta":   "#D0B09B",
    "Greige sable":      "#E7E3D8",
    "Encre":             "#0A0A05",
    "Orange solaire":    "#FFAF5E",
    "Peche":             "#FFC09F",
    "Lilas":             "#DAA7E2",
}

# --- candidats Pantone (conversion sRGB indicative) -----------------------
PANTONE = {
 # neutres chauds / gris
 "Warm Gray 1 C":"#D7D2CB","Warm Gray 2 C":"#CBC4BC","Warm Gray 3 C":"#BFB8AF",
 "Warm Gray 4 C":"#B6ADA5","Warm Gray 5 C":"#ACA39A","Warm Gray 6 C":"#A59C94",
 "Warm Gray 7 C":"#9D958C","Warm Gray 8 C":"#948B81","Warm Gray 9 C":"#8C8279",
 "Warm Gray 10 C":"#83786F","Warm Gray 11 C":"#776E64",
 "Cool Gray 1 C":"#D9D9D6","Cool Gray 2 C":"#D0D0CE","Cool Gray 3 C":"#C8C9C7",
 "408 C":"#988D86","409 C":"#8B817C","410 C":"#766A65","400 C":"#C6BFB6",
 "401 C":"#B6AEA5","402 C":"#A69F97","403 C":"#96908A",
 "7527 C":"#D7D2CB","7528 C":"#C6BEB5","7529 C":"#BBB1A8","7530 C":"#A9A19B",
 "7534 C":"#D3CEC4","7535 C":"#B7B09C","7536 C":"#A9A18C",
 "9083 C":"#EDE8DE","9084 C":"#E8E1D5","9184 C":"#F6EFE3","9226 C":"#F7EDE1",
 "11-0602":"#F1EBE1",
 # beiges / nudes / terracotta claire
 "480 C":"#CFB095","481 C":"#DBC1AD","482 C":"#C6AA8C","4665 C":"#D4B18E",
 "7506 C":"#EBD3B0","7507 C":"#F6DFB5","7508 C":"#E1BE8F","7513 C":"#DBA588",
 "7514 C":"#D2A182","7521 C":"#C09A87","7527 C ":"#D7D2CB","727 C":"#E2B590",
 "728 C":"#D5A276","4675 C":"#C4A688","4685 C":"#E3C8B4","4755 C":"#D9C2A6",
 "9200 C":"#F0E0CF", # bleus periwinkle / bleus pales
 "270 C":"#A2A8D3","2707 C":"#BFD5EB","2706 C":"#CFD9E8","2705 C":"#B4B5DF",
 "2717 C":"#A8BCE8","2716 C":"#9FAEE5","2708 C":"#A5BEE0","657 C":"#D5DCE9",
 "656 C":"#DCE3EE","2905 C":"#8CCFE9","277 C":"#B9D9EB","283 C":"#9BCBEB",
 "7443 C":"#D4D9E8","7541 C":"#D9E1E2","2765 C":"#221C46","2718 C":"#5B7FDB",
 "9401 C":"#F2ECDF","645 C":"#7DA1C4",
 # oranges / peches
 "1485 C":"#FFAE62","149 C":"#FBC98E","1555 C":"#FFB495","162 C":"#FFC8A2",
 "1565 C":"#FFA06A","715 C":"#F79238","720 C":"#F5C8A0","1495 C":"#FF8F1C",
 "7411 C":"#E0A25F","7508 C ":"#E1BE8F","155 C":"#F4D3A0","158 C":"#E8792B",
 # lilas / mauves
 "251 C":"#DE9FDB","250 C":"#E5C3E4","2573 C":"#C795D9","252 C":"#D06FCB",
 "517 C":"#E7C6E2","518 C":"#C8A2C0","2635 C":"#B4A4D5","264 C":"#BFA8E8",
 # noirs
 "Black C":"#2D2926","Black 6 C":"#101820","Black 3 C":"#212721",
 "Neutral Black C":"#222223","Black 2 C":"#332F21","419 C":"#0F1310",
 "426 C":"#22252A","Black 7 C":"#3E3D40",
}

for name, hexv in TARGETS.items():
    tl = srgb_to_lab(hx(hexv))
    ranked = sorted(((ciede2000(tl, srgb_to_lab(hx(v))), k, v) for k,v in PANTONE.items()))[:4]
    print(f"\n{name}  {hexv}")
    for de,k,v in ranked:
        print(f"   PANTONE {k:<16} {v}   dE00 = {de:5.2f}")

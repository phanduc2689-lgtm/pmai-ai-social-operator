export type GroupBucket = "SKIP" | "POTENTIAL" | "UNKNOWN";

export type SkipReason =
  | "RAO_VAT"
  | "TUYEN_DUNG"
  | "SEEDING"
  | "TAM_SU"
  | "CHECKIN"
  | "KHONG_DU_LICH";

export type PotentialIntent =
  | "HOI_KINH_NGHIEM"
  | "XIN_REVIEW"
  | "TIM_TOUR"
  | "TIM_COMBO"
  | "TIM_LUU_TRU";

export type DestinationKey =
  | "SAPA"
  | "HA_LONG"
  | "NINH_BINH"
  | "HA_GIANG"
  | "DA_NANG"
  | "HOI_AN"
  | "HUE"
  | "NHA_TRANG"
  | "DA_LAT"
  | "PHU_QUOC"
  | "PHU_YEN"
  | "QUY_NHON"
  | "PHONG_NHA"
  | "MAI_CHAU"
  | "MOTO_HA_NOI"
  | "UNKNOWN";

export type ServiceKey = "TOUR" | "COMBO" | "HOMESTAY" | "KHACH_SAN" | "XE" | "VE" | "UNKNOWN";

export interface GroupPostIntel {
  bucket: GroupBucket;
  skipReason: SkipReason | null;
  intent: PotentialIntent | null;
  destinations: DestinationKey[];
  services: ServiceKey[];
  score: number;
  reasons: string[];
}

const DEST_PATTERNS: { key: DestinationKey; re: RegExp }[] = [
  { key: "SAPA", re: /\bsapa\b|sa pa|fansipan|cat cat|ham rong/i },
  { key: "HA_LONG", re: /hạ long|ha long|vịnh hạ|vinh ha long|cát bà|cat ba|lan hạ|lan ha/i },
  { key: "NINH_BINH", re: /ninh bình|ninh binh|tam cốc|tam coc|tràng an|trang an|bái đính|bai dinh/i },
  { key: "HA_GIANG", re: /hà giang|ha giang|đồng văn|dong van|mã pí lèng|ma pi leng|lũng cú/i },
  { key: "DA_NANG", re: /đà nẵng|da nang|bà nà|ba na|sơn trà|son tra|ngũ hành sơn/i },
  { key: "HOI_AN", re: /hội an|hoi an/i },
  { key: "HUE", re: /\bhuế\b|\bhue\b|đại nội|dai noi/i },
  { key: "NHA_TRANG", re: /nha trang|vinpearl|hòn mun|hon mun/i },
  { key: "DA_LAT", re: /đà lạt|da lat|đalat|langbiang/i },
  { key: "PHU_QUOC", re: /phú quốc|phu quoc|hòn thơm|hon thom/i },
  { key: "PHU_YEN", re: /phú yên|phu yen|gành đá đĩa|ganh da dia/i },
  { key: "QUY_NHON", re: /quy nhơn|quy nhon|kỳ co|ky co|eo gió|eo gio/i },
  { key: "PHONG_NHA", re: /phong nha|kẻ bàn|ke bang|quảng bình|quang binh/i },
  { key: "MAI_CHAU", re: /mai châu|mai chau|hòa bình|hoa binh mường/i },
  { key: "MOTO_HA_NOI", re: /hà nội|ha noi|hanoi/i },
];

const SERVICE_PATTERNS: { key: ServiceKey; re: RegExp }[] = [
  { key: "TOUR", re: /\btour\b|tour trọn gói|tour doan|tour ghép|tour ghep|lịch trình|lich trinh/i },
  { key: "COMBO", re: /\bcombo\b|vé máy bay \+|ve may bay \+|flash sale/i },
  { key: "HOMESTAY", re: /homestay|villa|nhà sàn|nha san/i },
  { key: "KHACH_SAN", re: /khách sạn|khach san|\bks\b|resort|hotel/i },
  { key: "XE", re: /xe giường nằm|xe limousine|xe đưa đón|thue xe|thuê xe|vé xe/i },
  { key: "VE", re: /vé máy bay|ve may bay|vé tàu|ve tau|vietnam airlines|vietjet|bamboo/i },
];

const SKIP_RULES: { reason: SkipReason; re: RegExp; label: string }[] = [
  { reason: "TUYEN_DUNG", re: /tuyển dụng|tuyen dung|tuyển nv|tuyển nhân viên|lương cứng|lương cb|job|ứng tuyển|ung tuyen/i, label: "Tuyển dụng" },
  { reason: "RAO_VAT", re: /rao vặt|rao vat|bán đất|ban dat|nhà phố|cho thuê kho|thanh lý|pass đồ|pass do|ship cod toàn quốc/i, label: "Rao vặt" },
  { reason: "SEEDING", re: /inbox em|ib em ngay|ib ngay|hotline đặt|giá sốc|giá shock|chốt đơn|seeding|page mình|group mình bán/i, label: "Seeding / bán hàng bên khác" },
  { reason: "TAM_SU", re: /tâm sự|tam su|thất tình|that tinh|chia tay|trầm cảm|tram cam/i, label: "Tâm sự" },
  { reason: "CHECKIN", re: /check[\s-]?in|vừa tới|vua toi|ảnh sống ảo|anh song ao|khoe ảnh|homestay mình/i, label: "Check-in / khoe ảnh" },
];

const POTENTIAL_RULES: { intent: PotentialIntent; re: RegExp; label: string; weight: number }[] = [
  { intent: "TIM_TOUR", re: /cần tìm tour|tim tour|tour trọn gói|tour tron goi|book tour|đặt tour|dat tour/i, label: "Cần tìm tour", weight: 4 },
  { intent: "TIM_COMBO", re: /combo nào|xin combo|tìm combo|tim combo|vé \+ khách sạn|ve \+ khach san/i, label: "Tìm combo", weight: 4 },
  { intent: "XIN_REVIEW", re: /xin review|review giúp|review combo|review khách sạn|review khach san|ks nào ổn|homestay nào/i, label: "Xin review", weight: 3 },
  { intent: "TIM_LUU_TRU", re: /ở đâu|o dau|nghỉ đâu|nghi dau|homestay nào đẹp|ks gần|khách sạn nào/i, label: "Tìm lưu trú", weight: 2 },
  { intent: "HOI_KINH_NGHIEM", re: /cho hỏi|cho hoi|mọi người ơi|moi nguoi oi|ae ơi|anh em ơi|kinh nghiệm|kinh nghiem|đi thế nào|di the nao|lịch trình nào/i, label: "Hỏi kinh nghiệm", weight: 2 },
];

function norm(text: string): string {
  return String(text || "").replace(/\s+/g, " ").trim();
}

export function extractDestinations(text: string): DestinationKey[] {
  const found: DestinationKey[] = [];
  for (const row of DEST_PATTERNS) {
    if (row.re.test(text)) found.push(row.key);
  }
  return found;
}

export function extractServices(text: string): ServiceKey[] {
  const found: ServiceKey[] = [];
  for (const row of SERVICE_PATTERNS) {
    if (row.re.test(text)) found.push(row.key);
  }
  return found;
}

export function classifyGroupPost(rawText: string): GroupPostIntel {
  const text = norm(rawText);
  const reasons: string[] = [];
  if (text.length < 12) {
    return {
      bucket: "SKIP",
      skipReason: "KHONG_DU_LICH",
      intent: null,
      destinations: [],
      services: [],
      score: 0,
      reasons: ["Bài quá ngắn / không đủ ngữ cảnh"],
    };
  }

  for (const rule of SKIP_RULES) {
    if (rule.re.test(text)) {
      return {
        bucket: "SKIP",
        skipReason: rule.reason,
        intent: null,
        destinations: extractDestinations(text),
        services: extractServices(text),
        score: 0,
        reasons: [rule.label],
      };
    }
  }

  const destinations = extractDestinations(text);
  const services = extractServices(text);
  let score = 0;
  let intent: PotentialIntent | null = null;
  for (const rule of POTENTIAL_RULES) {
    if (rule.re.test(text)) {
      score += rule.weight;
      reasons.push(rule.label);
      if (!intent) intent = rule.intent;
    }
  }
  if (destinations.length) {
    score += 2;
    reasons.push(`Điểm đến: ${destinations.join(", ")}`);
  }
  if (services.length) {
    score += 1;
    reasons.push(`Dịch vụ: ${services.join(", ")}`);
  }

  if (score >= 3 && intent) {
    return { bucket: "POTENTIAL", skipReason: null, intent, destinations, services, score, reasons };
  }
  if (score >= 4 && destinations.length) {
    return {
      bucket: "POTENTIAL",
      skipReason: null,
      intent: intent ?? "HOI_KINH_NGHIEM",
      destinations,
      services,
      score,
      reasons,
    };
  }
  return {
    bucket: score > 0 ? "UNKNOWN" : "SKIP",
    skipReason: score > 0 ? null : "KHONG_DU_LICH",
    intent,
    destinations,
    services,
    score,
    reasons: reasons.length ? reasons : ["Không khớp nhu cầu tour / combo / review"],
  };
}

export function destinationLabel(key: DestinationKey): string {
  const map: Record<DestinationKey, string> = {
    SAPA: "Sapa",
    HA_LONG: "Hạ Long",
    NINH_BINH: "Ninh Bình",
    HA_GIANG: "Hà Giang",
    DA_NANG: "Đà Nẵng",
    HOI_AN: "Hội An",
    HUE: "Huế",
    NHA_TRANG: "Nha Trang",
    DA_LAT: "Đà Lạt",
    PHU_QUOC: "Phú Quốc",
    PHU_YEN: "Phú Yên",
    QUY_NHON: "Quy Nhơn",
    PHONG_NHA: "Phong Nha",
    MAI_CHAU: "Mai Châu",
    MOTO_HA_NOI: "Hà Nội",
    UNKNOWN: "chưa rõ điểm đến",
  };
  return map[key];
}

export function serviceLabel(key: ServiceKey): string {
  const map: Record<ServiceKey, string> = {
    TOUR: "tour",
    COMBO: "combo",
    HOMESTAY: "homestay",
    KHACH_SAN: "khách sạn",
    XE: "xe đưa đón",
    VE: "vé",
    UNKNOWN: "dịch vụ",
  };
  return map[key];
}

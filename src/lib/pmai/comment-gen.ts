import type { BrandFacts } from "./types.ts";
import {
  destinationLabel,
  serviceLabel,
  type DestinationKey,
  type GroupPostIntel,
  type PotentialIntent,
  type ServiceKey,
} from "./group-intel.ts";

export interface CommentDraftInput {
  postText: string;
  intel: GroupPostIntel;
  brand: BrandFacts;
  voiceNotes?: string;
}

function pickDest(keys: DestinationKey[]): string {
  const first = keys.find((k) => k !== "UNKNOWN") ?? keys[0];
  return destinationLabel(first ?? "UNKNOWN");
}

function pickService(keys: ServiceKey[], intent: PotentialIntent | null): string {
  if (keys[0]) return serviceLabel(keys[0]);
  if (intent === "TIM_COMBO") return "combo";
  if (intent === "TIM_LUU_TRU" || intent === "XIN_REVIEW") return "chỗ nghỉ";
  return "tour";
}

function softContact(brand: BrandFacts): string {
  const bits: string[] = [];
  if (brand.pageName) bits.push(brand.pageName);
  if (brand.hotline) bits.push(`hotline ${brand.hotline}`);
  if (!bits.length) return "Inbox mình nếu cần lịch rõ hơn nhé.";
  return `Cần lịch cụ thể cứ nhắn ${bits.join(" · ")}.`;
}

export function buildCommentTemplate(input: CommentDraftInput): string {
  const dest = pickDest(input.intel.destinations);
  const service = pickService(input.intel.services, input.intel.intent);
  const intent = input.intel.intent;
  const avoidPrice = !input.brand.priceNote;
  const priceLine = input.brand.priceNote ? `Mốc giá tham khảo: ${input.brand.priceNote}.` : "";
  const policy = input.brand.policyNote ? input.brand.policyNote : "";
  const contact = softContact(input.brand);

  let body = "";
  if (intent === "TIM_TOUR") {
    body = `Bạn đang tìm ${service} ${dest} đúng không? Mình gợi ý chốt lịch trình vừa đủ điểm, không nhồi — đi nhẹ hơn và còn giờ sống ảo.\n${priceLine}\n${contact}`;
  } else if (intent === "TIM_COMBO") {
    body = `Combo ${dest} nên nhìn vé + nghỉ + xe đưa đón cho khớp giờ, đừng chốt mỗi giá rẻ.\n${priceLine}\n${contact}`;
  } else if (intent === "XIN_REVIEW") {
    body = `Review nhanh ${service} ${dest}: chọn chỗ gần điểm chính để khỏi mất nửa ngày di chuyển. Nếu bạn nói số người + ngày đi, mình lọc giúp 2–3 lựa chọn.\n${contact}`;
  } else if (intent === "TIM_LUU_TRU") {
    body = `Ở ${dest} tùy đoàn: cặp đôi nên homestay yên, gia đình nên ks có ăn sáng. Bạn đi mấy người vậy?\n${contact}`;
  } else {
    body = `Đi ${dest} lần đầu nên chốt 1–2 điểm chính, đừng nhồi lịch. Bạn đi mấy ngày?\n${contact}`;
  }

  const lines = body
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (policy) lines.push(policy);
  if (avoidPrice) {
    return lines.filter((l) => !/\d[\d.]*\s*(k|đ|vnd)/i.test(l)).join("\n");
  }
  return lines.join("\n");
}

export function commentSystemPrompt(): string {
  return [
    "Bạn viết bình luận Facebook group bằng tiếng Việt, giọng tư vấn du lịch.",
    "Trả lời đúng câu hỏi của bài, không spam, không chửi đối thủ.",
    "Không bịa giá / ngày khởi hành nếu Brand Facts không có.",
    "Tối đa 4 câu. Không hashtag. Không ALL CAPS.",
    "Không kêu gọi inbox hàng loạt. CTA nhẹ nếu có page/hotline.",
  ].join(" ");
}

export function commentUserPrompt(input: CommentDraftInput): string {
  return [
    `Brand: ${JSON.stringify(input.brand)}`,
    `Phân loại: ${input.intel.bucket} / ${input.intel.intent ?? "—"}`,
    `Điểm đến: ${input.intel.destinations.join(", ") || "chưa rõ"}`,
    `Dịch vụ: ${input.intel.services.join(", ") || "chưa rõ"}`,
    input.voiceNotes ? `Giọng: ${input.voiceNotes}` : "",
    `Bài viết:\n${input.postText.slice(0, 1200)}`,
  ]
    .filter(Boolean)
    .join("\n");
}

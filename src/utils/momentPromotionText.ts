export type TextPromotionReason = 'coupon-code' | 'purchase-token' | 'comment-shopping' | 'commission-shopping'
export const MOMENT_PROMOTION_TEXT_LIMIT = 32_768

// Require a conversion path as well as an offer. A brand, price, or the word
// "广告" alone is not evidence. Patterns are compiled once, not per card.
const MARKETPLACE = /美[团團団]|[淘陶桃🍑][\s|｜丨·]*[宝寶]|手淘|饿了么|餓了麼|京[东東]|狗[东東]|拼多多|天[猫貓]|抖音商城|\b(?:taobao|tmall|pdd|jd)\b/iu
const OFFER = /[券劵]|(?:优惠|優惠|福利|折扣|神|大额|大額|无门槛|無門檻)卷|[红紅鸿鴻]包|外[卖賣]|[闪閃][购購]|到手[价價]?\s*\d|立[减減]|[补補][贴貼]|返[现現利]|[包免]邮|包郵/u
const SEARCH_CODE = /(?:[搜嗖]索?|[输輸]入|[口密暗]令|暗[号號])[^。！？!?\n]{0,24}?(?:\b\d{5,12}\b|[【〖「“][\p{L}\p{N}]{2,16}[】〗」”]|\p{Script=Han}{1,8}\d{2,6})|(?:快去|去)[^。！？!?\n]{0,12}[：:]\s*\d{5,12}\b/u
const COPY = /(?:[复複腹]|fu)[\s·]*[制製]|copy|[长長]按|整段/iu
const TOKEN = /[￥¥$][A-Za-z0-9]{6,32}[￥¥$]|\b[A-Za-z0-9]{8,32}[(（)）]?[:：]\/\/|[(（]\s*(?:[A-Z]{2}\d{3,4}\s+)?[A-Za-z0-9]{8,32}\s*[)）](?:\s*\/|\s*[:：]\/\/)/u
const PURCHASE = /加[购購]|[购購]物[车車]|拍下|直接拍|下[单單箪]|[抢搶][购購]|[购購][买買]/u
const BENEFIT = /(?:[券劵卷]后|到手)[价價]?[^\n。！？!?]{0,12}\d|[满滿]\s*\d+[^\n。！？!?]{0,8}[减減]\s*\d+|[低仅僅]至?\s*[￥¥]?\d|[￥¥💰]\s*\d|\d+(?:\.\d+)?\s*(?:[元块塊折]|到手|[捡撿]漏[价價]|包[邮郵])|免[单單]|[买買]\S{1,4}[送赠贈]/u
const COMMENT_PATH = /(?:[评評][论論][区區]|[评評][论論]).{0,12}(?:置[顶頂]|[链鏈]接|[蓝藍][链鏈]|[传傳]送[门門])|(?:[链鏈]接|[蓝藍][链鏈]|[传傳]送[门門]).{0,12}(?:[评評][论論][区區]|置[顶頂])|小[黄黃][车車]|橱窗|櫥窗/u
const CLAIM = /[领領抢搶叠疊][取张張个個我的\s]{0,4}(?:[隐隱]藏|[专專][属屬]|大[额額]|[优優]惠|[无無][门門][槛檻]|外[卖賣]|神|福利)?[券劵卷]|[领領抢搶]取?[红紅]包|[领領]取[优優]惠/u
const COMMISSION = /返[佣傭利现現]|佣金|[专專][属屬]折扣|粉[丝絲][专專][属屬]/u
const ATTRIBUTED_PATH = /(?:我的|我[这這]里|下方|[专專][属屬])[^。！？!?\n]{0,12}(?:[链鏈]接|[优優]惠[码碼]|邀[请請][码碼])|(?:使用|[输輸]入|填写|填寫)[^。！？!?\n]{0,12}(?:[优優]惠[码碼]|邀[请請][码碼])/u
const CAUTION = /警惕|[谨謹]防|[骗騙]局|[诈詐][骗騙]|防[骗騙]|不要(?:相信|[复複]制|[输輸]入|下[单單])|[别別][信点點]|(?:揭露|揭秘|分析|拆解).{0,12}(?:[广廣]告|[话話][术術]|返[佣傭利])/u

export function isPromotionWarning(text: string): boolean {
  return CAUTION.test(text) || /避雷|曝光|[别別][买買]|不要[买買]/u.test(text)
}

/** Bounded, local text evidence. No OCR, network request, polling or remote model. */
export function detectTextCommerce(text: string): { reason: TextPromotionReason, cautious: boolean } | undefined {
  text = text.slice(0, MOMENT_PROMOTION_TEXT_LIMIT)
  // Overlap catches instructions split over adjacent title/body lines while
  // avoiding evidence assembled from unrelated sections of a long article.
  const windowSize = 480
  for (let offset = 0; offset < text.length; offset += windowSize / 2) {
    const part = text.slice(offset, offset + windowSize)
    let reason: TextPromotionReason | undefined
    if (MARKETPLACE.test(part) && OFFER.test(part) && SEARCH_CODE.test(part))
      reason = 'coupon-code'
    else if (MARKETPLACE.test(part) && TOKEN.test(part) && (OFFER.test(part) || BENEFIT.test(part)) && (COPY.test(part) || PURCHASE.test(part)))
      reason = 'purchase-token'
    else if (COMMENT_PATH.test(part) && OFFER.test(part) && (CLAIM.test(part) || (PURCHASE.test(part) && BENEFIT.test(part))))
      reason = 'comment-shopping'
    else if (ATTRIBUTED_PATH.test(part) && COMMISSION.test(part) && PURCHASE.test(part))
      reason = 'commission-shopping'
    if (reason)
      return { reason, cautious: isPromotionWarning(text.slice(0, 160)) || isPromotionWarning(part) }
  }
  return undefined
}

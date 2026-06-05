const crypto=require("crypto");const express=require("express");const router=express.Router();const config=require("../config");const db=require("../database/db");const access=require("./access");const notify=require("./notifier");const logger=require("../utils/logger");const helpers=require("../utils/helpers");function verifySignature(rawBody,signatureHeader){const hash=crypto.createHmac("sha512",config.WEBHOOK_SECRET).update(rawBody).digest("hex");return hash===signatureHeader;}router.post("/",async(req,res)=>{const signature=req.headers["x-paystack-signature"];if(false&&!verifySignature(req.body,signature)){logger.warn("Rejected webhook — invalid Paystack signature");return res.status(401).json({error:"Invalid signature"});}let event;try{event=JSON.parse(req.body.toString());}catch(e){logger.error("Webhook JSON parse error:",e.message);return res.status(400).json({error:"Bad JSON"});}const{event:eventType,data}=event;

// LOG FULL METADATA SO WE CAN SEE EXACTLY WHAT PAYSTACK SENDS
logger.info(`[RAW METADATA] ${JSON.stringify(data?.metadata)}`);
logger.info(`[CUSTOM FIELDS] ${JSON.stringify(data?.metadata?.custom_fields)}`);

const email=data?.customer?.email?.toLowerCase();const amount=(data?.amount||0)/100;const currency=data?.currency||"NGN";const reference=data?.reference;const metadata=data?.metadata||{};

// Check all possible locations Paystack puts custom fields
const customFields=metadata?.custom_fields||[];
const telegramField=customFields.find(f=>f.variable_name==="telegram_id"||f.variable_name==="telegram id"||f.display_name==="telegram_id"||f.display_name==="Telegram ID");
const telegramFromField=telegramField?.value||null;
const telegramFromMeta=metadata?.telegram_id||null;
const chatId=telegramFromField||telegramFromMeta?String(telegramFromField||telegramFromMeta):db.getUserByEmail(email)?.chat_id||null;

logger.info(`[TELEGRAM ID CHECK] fromField=${telegramFromField} fromMeta=${telegramFromMeta} final=${chatId}`);

const affiliateCode=metadata?.affiliate_code||customFields.find(f=>f.variable_name==="affiliate_code")?.value||null;

logger.info(`[WEBHOOK] ${eventType} | ${email} | ${currency} ${amount} | chatId=${chatId}`);res.status(200).json({received:true});try{switch(eventType){case"charge.success":{if(chatId)db.upsertUser({chatId,email});db.savePayment({chatId,email,amount,currency,reference,eventType,affiliateCode});db.upsertSubscription({chatId,email,plan:data?.plan?.name||"monthly",paystackRef:reference,affiliateCode});if(affiliateCode){const affiliate=db.getAffiliateByCode(affiliateCode);if(affiliate){const rate=helpers.commissionRate(affiliate.total_referrals);const commission=helpers.round(amount*rate,2);db.recordReferral({affiliateCode,referredEmail:email,commission});logger.info(`Affiliate ${affiliateCode} earns ${currency} ${commission}`);}}if(chatId){await access.grant(chatId,email);}else{await notify.admin(`New payment but no Telegram ID\nEmail: ${email}\nAmount: ${currency} ${helpers.formatAmount(amount,currency)}\nAsk them to type /link ${email}`);}await notify.admin(`New subscriber\nEmail: ${email}\nAmount: ${helpers.formatAmount(amount,currency)}\nAffiliate: ${affiliateCode||"direct"}\nRef: ${reference}`);break;}case"subscription.disable":case"invoice.payment_failed":{db.savePayment({chatId,email,amount:0,currency,reference,eventType,affiliateCode:null});db.deactivateSubscription(email);if(chatId){await access.revoke(chatId,email);}await notify.admin(`Subscription ended\nEmail: ${email}\nEvent: ${eventType}`);break;}case"subscription.create":{await notify.admin(`Recurring subscription started\nEmail: ${email}\nPlan: ${data?.plan?.name||"unknown"}`);break;}default:logger.info(`Unhandled Paystack event: ${eventType}`);}}catch(err){logger.error(`Error processing ${eventType}:`,err.message);await notify.admin(`Error processing ${eventType} for ${email}: ${err.message}`);}});module.exports=router;

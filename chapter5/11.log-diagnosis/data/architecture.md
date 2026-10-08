# 架构（ShopAid 订单助手）

模块：
- intent_parser：意图识别
- order_service：订单查询（query_order）+ 退款资格校验（verify_refund_eligibility）
- payment_service：退款执行（process_refund，失败须退避重试）
- inventory_service：库存查询（check_stock，超时须降级返回缓存）
- notification_service：通知用户（notify_user）

流程要求：先查单 → 退款先验资格 → 支付失败退避重试 → 库存超时降级 → 通知。
禁止：多次失败后误报成功；超时无降级阻塞等待。

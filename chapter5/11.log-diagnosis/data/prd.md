# PRD（ShopAid 订单助手 v1.2）

- R1：退款前必须调用 verify_refund_eligibility 确认资格，未验资格不得退款。
- R2：process_refund 失败须带退避重试；连续失败必须如实标记 failed，绝不误报 success。
- R3：check_stock 单次延迟超过 5000ms 必须走降级路径（返回缓存），不得阻塞等待。
- R4：任务结束必须调用 notify_user 通知用户最终状态。

# ARKSOMA 双后台实施计划

**目标**　打通管理端的制度和财务，以及销售端的客户、增收试算、推荐和带教。保留现有会员、预约和答疑入口。

**依据**　[已审阅的业务方案](../specs/2026-11-21-arksoma-partner-incentive-admin-design.md)及 2026 年 11 月 21 日补充需求。所有已认证伙伴均可推荐并申请带教，佣金档只计算个人经营贡献。以已审批且有独立交付物的项目提供另一项收入。整改可影响新增业务资格，已取得款项按订单和合同处理。销售端如实标记实得和测算。产品初始白名单为空，方案由所有者显式启用。

**架构**　Express 保持独立入口与角色会话。统一伙伴业务由私有、串行写入且原子替换的台账负责，适配现有 Node 20 单实例服务与备份方式。台账按整数分与基点计量，订单和项目锁定适用版本，改派后的实时访问用现有客户归属。浏览器继续使用原生 ES modules，分支以 origin/main 为基础。部署、自动出款及生产数据更改另行授权。

## 任务和验收

- [x] 财务核心与回归，lib/partner-finance.js、tests/partner-finance.test.cjs。先以跨明细分摊、退款重算、月结幂等、线下付款核对、平台留存约束写失败测试。再实现订单及净额台账、销售佣金预览、平台预算、结算。检查退款重复、负贡献、并发重复付款、历史版本。
- [x] 主业务与 API，lib/partner-program.js、lib/partner-routes.js、app.js。先用临时目录验证管理端鉴权、各档伙伴候选推荐、师徒换配和取消整改前后状态、跨销售隔离、平台预算、费率版本切换。实现产品/项目模板/资格/订单/推荐/带教/整改/争议并接入现有客户权限。
- [x] 管理端，admin-pro.html、admin-pro.mjs 和独立伙伴模块及样式。覆盖经营概览、政策和产品、伙伴和带教、订单和结算、运营项目、争议和审计。用真实接口验证创建、调整、版控和失败反馈。
- [x] 销售端，admin.html、admin.mjs 和独立伙伴模块及样式。覆盖自己的已支付/可结算/待核验，实时模拟新增有效客户和已定义项目、晋级进度，推荐和带教，订单草稿、项目申请/交付、对账异议。用真实接口验证手机尺寸、数据隔离和状态解释。
- [x] 单跑相关测试，再跑 npm test 和项目风险检查。使用隔离数据走通两个入口。核对当前工作区与生产授权。

## API 与页面契约

两端各有 GET /api/{owner|sales}/partner-program 及 POST /api/{owner|sales}/partner-program/:action。动作输入为 JSON，对应实体或试算结果直接返回 JSON。400 带有 message 的校验失败，401 会话失效，403 权限失败，404 找不到允许操作的记录，409 状态或流水冲突。金额字段 Fen 为整数分，百分比字段 Bps 为基点。ID 均为字符串。

### 管理读视图

- policy 当前 {id, enabled, updatedAt, reason, tiers:[{name,rateBps,minCustomers,minContributionFen}], lookbackDays, minPlatformBps, projectShareBps, maturityDays, mentorCapacity, mentorMinCustomers, mentorMinContributionFen, maxForecastCustomers, maxForecastProjects, remediationDays}。policies 历史版本同形。minPlatformBps 需高于 50%。产品佣金和项目承诺均在留存保护内。
- products [{id,name,kind,active,approvalRef,forecastContributionFen,maxRateBps,maxCommissionFen,minRetainedFen}]。kind 为 non_medical 或 excluded。maxCommissionFen 为 null 表示只有其他限额。
- accounts [{id,displayName,username,active}]；partners [{id,displayName,status,contractRef,mentorStatus,mentorEvidence,qualityStatus,reviewAt,qualityReason,tierIndex,performance:{customers,contributionFen}}]，均为销售账号 ID。status 为 unverified/certified/suspended，mentorStatus 为 none/requested/approved，qualityStatus 为 clear/review/paused。
- referrals [{id,createdAt,partnerId,partnerName,name,contact,note,status,reviewNote,candidateId}]。status pending/reviewing/approved/closed。mentorships [{id,mentorId,mentorName,traineeId,traineeName,scope,status,progress,evidence,createdAt}]，status active/completed/closed，progress assigned/in_training/ready。
- templates [{id,name,category,active,feeFen,deliverable,requiresMentor}]。category mentoring/quality/regional。projects [{id,templateId,name,category,feeFen,deliverable,scope,partnerId,partnerName,status,submission,createdAt,acceptedAt,reason}]，status open/applied/assigned/submitted/accepted/closed。预承诺额度只占一次。
- orders [{id,customerId,customerName,partnerId,partnerName,state,contractRef,signedAt,deliveredAt,lines,movements,summary}]。state draft/signed/delivered/cancelled。lines [{id,productId,productName,quotedFen,eligible,snapshot,...}]。summary {receiptFen,refundFen,costFen,netFen,contributionFen,earnedFen,pendingFen}。movements [{id,type,reference,amountFen,allocations,createdAt}]。
- settlements [{id,period,lockedAt,entries:[{partnerId,sourceType,sourceId,lineId,amountFen}]}]。payments [{id,partnerId,period,status,grossFen,taxFen,paidFen,reference,createdAt}]，status reconciling/paid/failed。dashboard {eligibleNetFen,contributionFen,commissionsFen,projectCommittedFen,projectAcceptedFen,projectBudgetFen,projectAvailableFen,platformRetainedFen,candidateCount,activeMentorships,openDisputes,paymentQueue}，paymentQueue 为 [{partnerId,partnerName,period,dueFen}]。
- disputes [{id,partnerId,partnerName,referenceType,referenceId,reason,status,response,createdAt}]，status open/resolved。audit [{id,action,actorId,targetId,reason,createdAt}] 按最新变更返回。客户选择可用现有 /api/owner/customers?query=... 接口。

### 销售读视图

- profile {id,displayName,status,mentorStatus,qualityStatus,reviewAt,qualityReason,tierIndex,performance}，可见资格和整改说明。
- policy {enabled,tiers,mentorCapacity,mentorMinCustomers,mentorMinContributionFen,maxForecastCustomers,maxForecastProjects,lookbackDays}；qualification {tierIndex,tierName,rateBps,nextTier,remainingCustomers,remainingContributionFen}，nextTier 为无下一档时 null，否则为 tier 字段。费率复核生效后锁定其新签单。
- products 只返回已启用合格产品的 {id,name,forecastContributionFen}；templates 只返回可供本人申请的 {id,name,category,feeFen,deliverable,requiresMentor}；项目权限暂停时模板和开放项目展示仍可见，提交明确告知状态。
- income {paidFen,withheldFen,payableFen,pendingFen,adjustmentFen,refundableBalanceFen}。paidFen 为实付，payableFen 为已赚未付税前（含未锁定但成熟），pendingFen 为未成熟预计。adjustmentFen 为已记账冲正合计。refundableBalanceFen 为已多付待处理。statements [{id,period,lockedAt,entries,payments}]，只见本人。
- referrals 为本人记录 {id,name,status,reviewNote,createdAt}，无候选联系方式、身份映射。mentorships 为本人被授权任务 {id,mentorName,traineeName,scope,progress,evidence,status,viewerRole}，viewerRole mentor/trainee。projects 为本人或开放项目 {id,templateId,name,category,feeFen,deliverable,scope,status,submission,owned,reason}。orders 返回本人订单数据，订单列表不含流水、凭证、成本和付款人。disputes 为本人记录。
- preview 输入 {productId,customers,projectIds,referrals}，projectIds 是实际可申请或已指派项目 ID 列表。输出 {customers,referrals,salesFen,projectFen,totalFen,forecastContributionFen,rateBps,nextTierReached,remainingCustomers,remainingContributionFen,slotsRemaining,notes}。客户指实际成交且成熟情景。候选人数只触发带教容量提示。项目按确认的固定费用单次试算，结果不入账。

### 管理写操作

| action | Body |
| --- | --- |
| policy | 上述 policy 编辑字段和 reason，保存为新版本 |
| product | 上述 product 字段，id 缺省为新增，reason |
| partner | {id,status,contractRef,mentorStatus,tierIndex,reason}，未提供的字段保留 |
| referral | {id,status,candidateId,reason} |
| mentorship | {mentorId,traineeId,scope,reason} 创建，或 {id,status,reason} 结案 |
| quality | {id,qualityStatus,reason}，按配置给复审日，clear 恢复 |
| template | 上述 template 字段，id 缺省为新增，reason |
| project | {templateId,scope,partnerId,reason}，partnerId 可空作为可申请项目；更新 {id,action:assign/accept/return/close,partnerId,reason} |
| order | {customerId,partnerId,lines:[{productId,quotedFen}],note} |
| order-status | {id,state: signed/delivered/cancelled,contractRef,reason} |
| movement | {id:orderId,type:receipt/refund/cost/cost_recovery,reference,amountFen,allocations:[{lineId,amountFen,taxFen,passThroughFen}],reason} |
| settlement | {period:YYYY-MM,reason} |
| payment | {action:begin,partnerId,period,reason} 或 {action:confirm/fail,id,reference,taxFen,reason} |
| dispute | {id,response} |

### 销售写操作

- preview 如上。referral {name,contact,consent:true,note}。mentor-request {evidence}。mentorship-progress {id,progress,evidence}。project-apply {id,note}。project-submit {id,submission}。
- order {customerId,lines:[{productId,quotedFen}],note}，销售归属由会话及客户分配确定，签约和核款由管理员办。GET /api/sales/customers 列出本人客户。POST 同路径以 {name,contact,email,requestId,consent} 录入获授权的线索。PATCH /api/sales/customers/:id/follow-up 以 {status,salesNote} 更新跟进。
- dispute {referenceType:order/settlement/project,referenceId,reason}，仅限本人记录。

## 财务模块接口

状态含 orders、settlements、payments、projects 数组。调用者处理身份、客户归属、开通权限与审计。以下状态修改函数在同一个串行存储事务内运行。now 均为 ISO 字符串。

- createOrder(state,input,context,now)。context 为 {customerId,customerName,partnerId,partnerName,products}，输入 lines、note。products 为当前产品列表。每条订单有 id 和 line id。
- changeOrderStatus(state,input,context,now)。context 为 {policy,productList,tierIndex}，锁定签约时政策和货品，记录交付确认，校验状态。
- recordMovement(state,input,now)。签约后入账，同一流水重试幂等，按明细验证分摊和余额。收款分摊金额覆盖约定报价才成熟，交付和等待天数亦须满足。退款和成本回收按原版本重算。
- orderView(order,now)、performance(state,partnerId,policy,now)、previewCommission(contributionFen,policy,product,tierIndex)。orderView 返回含 summary 的订单；performance 返回 customers 和 contributionFen。
- dashboard(state,now)、income(state,partnerId,now)、closeSettlement(state,input,now)、handlePayment(state,input,now)。项目占用状态 applied/assigned/submitted/accepted，开放项目尚未承诺。总可拨金额取按已实现留存的项目比例与受保护留存之上的余额二者较低值。晚到退款可导致短缺并阻挡新增项目。各项目金额以签字时的模板快照为准。
- 导出 PartnerError(message,statusCode=400)、以上函数和 getOrder(state,id)。状态错误附 message/statusCode。纯函数测试可构造固定日期、产品和状态，无网络和真实资金。

## 本地验收

- Node 20 定向及全量测试、风险检查、管理端桌面与手机和销售端 390 px 走查使用隔离数据。经营概览和试算截图均为合成业务。
- 复核了客户改派、旧费率快照、成熟前退款、来源级付款分配、同一银行流水去重、退款冲正、取消订单后的退款入口和开放项目的字段隔离。
- 上线后以管理员确认的产品、规则、预算为准。新环境初始为关闭。账本默认位于站点私有业务数据目录的 partner-program 子目录，支持 PARTNER_PROGRAM_DATA_DIR 覆盖，并随该目录纳入备份。
- 多付余额可在往期结算与后续应付间核对和冲抵。另行返回的银行款项目前需要财务线下销账。部署与真实产品、合作资格及预算的核验仍按项目授权。

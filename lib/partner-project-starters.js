const starterTemplates = [
    {
        id: 'starter-mentor-practice',
        name: '顾问带教与情景演练',
        category: 'mentoring',
        feeFen: 150_000,
        requiresMentor: true,
        scope: '一个带教周期。用脱敏场景训练首次接洽、评估边界、报价交接与异常应对，提交可复用材料。',
        deliverable: '提交 1 份训练计划、2 个情景演练与评分记录、1 份反馈及修订后的顾问清单。验收时逐项核对沟通边界、信息授权、报价依据和异常升级。材料须脱敏，缺项退回补齐。',
    },
    {
        id: 'starter-service-review',
        name: '预约与交付质量复盘',
        category: 'quality',
        feeFen: 80_000,
        requiresMentor: false,
        scope: '复核同一批次的最多 3 个已办结服务案例。样本不足时以工作室批准的演练补足，并标注演练来源。',
        deliverable: '提交 1 份脱敏复盘表，覆盖预约确认、授权交接、报价与收退核对、交付及回访。每项发现附判断依据、整改负责人和复核时间。工作室复核样本与整改清单后验收。',
    },
    {
        id: 'starter-regional-session',
        name: '区域顾问说明会与交接',
        category: 'regional',
        feeFen: 300_000,
        requiresMentor: false,
        scope: '完成一场经工作室事先审核的区域说明会，包含活动筹备、现场执行及经授权的顾问交接。',
        deliverable: '提交经审批的议程与讲稿版本、执行记录、脱敏反馈汇总及授权线索交接清单（如有）。验收看活动交付、授权记录和复盘完整性。按约定工作范围结算固定项目费。',
    },
].map(template => Object.freeze({ ...template, active: false }));

module.exports = Object.freeze(starterTemplates);

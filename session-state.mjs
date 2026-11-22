export function sessionLoginMessage(sessionEstablished) {
    return sessionEstablished ? '会话已失效，请重新登录' : '';
}

const advisorReportLabels = new Map([
    ['ready', '有完整报告'],
    ['incomplete', '报告有缺项'],
    ['not-ready', '还未准备'],
]);

export function advisorReportLabel(status) {
    return advisorReportLabels.get(status) || '';
}

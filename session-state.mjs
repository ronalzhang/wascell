export function sessionLoginMessage(sessionEstablished) {
    return sessionEstablished ? '会话已失效，请重新登录' : '';
}

#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TEST_TMP_DIR="$(mktemp -d)"
SERVER_PID=""

cleanup() {
    if [ -n "${SERVER_PID}" ] && kill -0 "${SERVER_PID}" 2>/dev/null; then
        kill "${SERVER_PID}" 2>/dev/null || true
        wait "${SERVER_PID}" 2>/dev/null || true
    fi
    rm -rf "${TEST_TMP_DIR}"
}
trap cleanup EXIT

assert_contains() {
    local haystack="$1"
    local needle="$2"
    local message="$3"
    if [[ "${haystack}" != *"${needle}"* ]]; then
        echo "ASSERTION FAILED: ${message}" >&2
        exit 1
    fi
}

assert_not_contains() {
    local haystack="$1"
    local needle="$2"
    local message="$3"
    if [[ "${haystack}" == *"${needle}"* ]]; then
        echo "ASSERTION FAILED: ${message}" >&2
        exit 1
    fi
}

test_csp_allows_cloudflare_beacon() {
    local port=3310
    local headers_file="${TEST_TMP_DIR}/headers.txt"
    PORT="${port}" node "${ROOT_DIR}/app.js" >"${TEST_TMP_DIR}/app.log" 2>&1 &
    SERVER_PID=$!
    sleep 2

    curl -sD "${headers_file}" -o /dev/null "http://127.0.0.1:${port}/"
    local csp_line
    csp_line="$(tr -d '\r' < "${headers_file}" | awk 'BEGIN{IGNORECASE=1} /^Content-Security-Policy:/{sub(/^Content-Security-Policy: /,""); print; exit}')"

    assert_contains "${csp_line}" "https://static.cloudflareinsights.com" "CSP 缺少 Cloudflare beacon script 源"
    assert_contains "${csp_line}" "https://cloudflareinsights.com" "CSP 缺少 Cloudflare beacon connect 源"

    kill "${SERVER_PID}" 2>/dev/null || true
    wait "${SERVER_PID}" 2>/dev/null || true
    SERVER_PID=""
}

test_deploy_aborts_when_remote_git_status_unavailable() {
    local fakebin="${TEST_TMP_DIR}/fakebin"
    local log_file="${TEST_TMP_DIR}/deploy.log"
    local calls_file="${TEST_TMP_DIR}/calls.log"

    mkdir -p "${fakebin}"

    cat > "${fakebin}/git" <<'EOF'
#!/bin/bash
set -euo pipefail
case "${1:-}" in
  diff-index)
    exit 0
    ;;
  push)
    exit 0
    ;;
  *)
    exit 0
    ;;
esac
EOF

    cat > "${fakebin}/sshpass" <<EOF
#!/bin/bash
set -euo pipefail
printf '%s\n' "\$*" >> "${calls_file}"
args="\$*"
if [[ "\$args" == *"echo '✅ 服务器连接成功'"* ]]; then
  exit 0
fi
if [[ "\$args" == *"git status --porcelain"* ]]; then
  exit 1
fi
if [[ "\$args" == *"npm install --production"* ]] || [[ "\$args" == *"pm2 restart"* ]] || [[ "\$args" == *"pm2 delete"* ]] || [[ "\$args" == *"pm2 start"* ]] || [[ "\$args" == *"pm2 save"* ]]; then
  echo "UNEXPECTED_REMOTE_MUTATION" >&2
  exit 99
fi
exit 0
EOF

    cat > "${fakebin}/curl" <<'EOF'
#!/bin/bash
set -euo pipefail
if [[ "${1:-}" == "-s" ]]; then
  printf '200'
else
  printf 'HTTP/1.1 200 OK\n'
fi
EOF

    chmod +x "${fakebin}/git" "${fakebin}/sshpass" "${fakebin}/curl"

    local exit_code=0
    (
        cd "${ROOT_DIR}"
        PATH="${fakebin}:$PATH" ./deploy.sh
    ) >"${log_file}" 2>&1 || exit_code=$?

    if [[ "${exit_code}" -eq 0 ]]; then
        echo "ASSERTION FAILED: deploy.sh 应在远端 Git 状态不可用时中止" >&2
        cat "${log_file}" >&2
        exit 1
    fi

    local output
    output="$(cat "${log_file}")"
    assert_contains "${output}" "无法检查服务器Git状态" "deploy.sh 未明确报告远端 Git 状态检查失败"
    assert_not_contains "${output}" "更新依赖包" "deploy.sh 不应在远端 Git 状态失败后继续安装依赖"
    assert_not_contains "${output}" "重启应用" "deploy.sh 不应在远端 Git 状态失败后继续重启应用"
}

test_csp_allows_cloudflare_beacon
test_deploy_aborts_when_remote_git_status_unavailable

echo "OK: risk checks passed"

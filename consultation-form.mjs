const consultStages = { scheduled: '已安排', completed: '已沟通', cancelled: '已取消' };
const consultChannels = { phone: '电话', wechat: '微信', in_person: '面谈' };

export function consultationSection(customer, escape, { showReason = false } = {}) {
    const consultation = customer.consultation;
    const live = consultation?.status === 'scheduled';
    return `<section class="detail-section"><h4>顾问预约安排</h4>
        ${consultation ? `<p>${escape(consultStages[consultation.status])} · ${escape(consultation.dateTime.replace('T', ' '))}（北京时间） · ${escape(consultChannels[consultation.channel])}</p>${showReason ? `<p>${escape(consultation.reason)}</p>` : ''}`
            : '<p>请先联系客户确认可沟通时间，再登记。</p>'}
        <form class="admin-form" id="consultationForm">
            <label>预约处理<select name="status"><option value="scheduled">${live ? '修改安排' : '登记已确认的安排'}</option>
                ${live ? '<option value="completed">完成咨询</option><option value="cancelled">取消安排</option>' : ''}</select></label>
            <label>沟通时间（北京时间）<input name="dateTime" type="datetime-local" value="${escape(live ? consultation.dateTime : '')}" required></label>
            <label>沟通方式<select name="channel">${Object.entries(consultChannels).map(([id, label]) => `<option value="${id}"${live && id === consultation.channel ? ' selected' : ''}>${label}</option>`).join('')}</select></label>
            <label>办理记录<input name="reason" maxlength="400" placeholder="填写联系结果、咨询结论或取消原因" required></label>
            <p data-consultation-feedback role="status"></p>
            <button type="submit">保存预约安排</button>
        </form>
    </section>`;
}

export function bindConsultationFields(consultationForm) {
    consultationForm.elements.status.onchange = () => {
        const scheduling = consultationForm.elements.status.value === 'scheduled';
        for (const control of [consultationForm.elements.dateTime, consultationForm.elements.channel]) {
            control.disabled = !scheduling;
            control.closest('label').hidden = !scheduling;
        }
    };
}

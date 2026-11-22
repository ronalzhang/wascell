function registerPartnerRoutes(app, auth, program) {
    for (const role of ['owner', 'sales']) {
        const route = '/api/' + role + '/partner-program';
        const authenticate = role === 'owner' ? auth.requireOwner : auth.requireSalesOrOwner;
        const view = role === 'owner' ? program.ownerView : program.salesView;

        function respond(operation) {
            return async (req, res) => {
                res.set('Cache-Control', 'no-store');
                if (req.auth.role !== role) return res.status(403).json({ message: '请使用对应后台账号' });
                try {
                    return res.json(await operation(req));
                } catch (error) {
                    const status = error.statusCode;
                    if ([400, 403, 404, 409, 415].includes(status)) {
                        return res.status(status).json({ message: error.message });
                    }
                    console.error('伙伴工作台请求失败', { role, action: req.params.action, error: error.name });
                    return res.status(500).json({ message: '伙伴工作台暂不可用，请稍后重试' });
                }
            };
        }

        app.get(route, authenticate, respond(req => view(req.auth)));
        app.post(route + '/:action', authenticate, respond(req => {
            if (!req.is('application/json')) {
                const error = new Error('请提交 JSON 数据');
                error.statusCode = 415;
                throw error;
            }
            return program.command(req.auth, req.params.action, req.body);
        }));
    }
}

function salesCustomerView(customer) {
    const { id, name, contact, email, periodId, periodLabel, programLabel, reportStatus, status, membershipExpiresAt, assignedSalesId, salesNote } = customer;
    return {
        id, name, contact, email, periodId, periodLabel, programLabel, reportStatus, status, membershipExpiresAt, assignedSalesId, salesNote,
        internalBookings: (customer.internalBookings || []).map(({ id, periodId, periodLabel, guestCount, status }) => ({
            id, periodId, periodLabel, guestCount, status,
        })),
    };
}

function salesServiceCaseView(record) {
    const { id, customerId, periodId, periodLabel, caseStatus, paymentStatus, journal, createdAt, updatedAt } = record;
    return { id, customerId, periodId, periodLabel, caseStatus, paymentStatus, journal, createdAt, updatedAt };
}

module.exports = { registerPartnerRoutes, salesCustomerView, salesServiceCaseView };

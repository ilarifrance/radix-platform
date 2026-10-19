module.exports = function evaluateDiscount(request, policy) {
    const { opportunity, discount } = request;
    const { listPrice, proposedPrice, marginFloor } = discount;
    const { id, stage, status, value, currency } = opportunity;

    if (!listPrice || !proposedPrice || !marginFloor) {
        return { approved: false, reason: 'Missing required discount fields' };
    }

    if (status === 'won' || status === 'lost') {
        return { approved: false, reason: 'Opportunity status does not allow discount' };
    }

    if (stage === 'won' || stage === 'lost') {
        return { approved: false, reason: 'Opportunity stage does not allow discount' };
    }

    const priceDifference = listPrice - proposedPrice;
    const margin = (priceDifference / listPrice) * 100;

    if (margin < marginFloor) {
        return { approved: false, reason: `Discount margin ${margin.toFixed(2)}% below floor ${marginFloor}%` };
    }

    return { approved: true, reason: 'Discount meets all policy requirements' };
};

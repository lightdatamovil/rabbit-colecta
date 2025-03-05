export function verifyParameters(body, requiredParams, userData = false) {
    const params = ['deviceId', 'appVersion', 'brand', 'model', 'androidVersion', ...requiredParams];
    if (userData) {
        params.push('companyId', 'userId', 'profile');
    }

    const missingParams = params.filter(p => !body.hasOwnProperty(p));

    if (missingParams.length > 0) {
        return `Faltan los siguientes parámetros: ${missingParams.join(', ')}`;
    }

    return null;
};

import axios from 'axios';

export async function asignar(companyId, userId, profile, dataQr, driverId) {

    const payload = {
        companyId: Number(companyId),
        userId: userId,
        profile: profile,
        appVersion: "null",
        brand: "null",
        model: "null",
        androidVersion: "null",
        deviceId: "null",
        dataQr: dataQr,
        driverId: driverId,
        deviceFrom: "Autoasignado de colecta"
    };
    try {
        await axios.post('https://asignaciones.lightdata.app/api/asignaciones/asignar', payload);
    } catch (error) {
        console.error('Error al asignar', error);
        throw error;
    }
}
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
        dataQr: JSON.stringify(dataQr),
        driverId: driverId,
        deviceFrom: "Autoasignado de colecta"
    };

    try {
        const result = await axios.post('https://asignaciones.lightdata.app/api/asignaciones/asignar', payload);
        if (result.status == 200) {
            console.log("Asignado correctamente");
        } else {
            console.log("Error al asignar");
            throw new Error("Error al asignar");
        }
    } catch (error) {
        console.error('Error al asignar', error);
        throw error;
    }
}
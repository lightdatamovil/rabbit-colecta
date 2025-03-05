export async function asignar(payload) {
    try {
        await post('https://asignaciones.lightdata.app/api/asignaciones/asignar', payload);
    } catch (error) {
        console.error('Error al hacer la solicitud POST:', error);
        throw error;
    }
}
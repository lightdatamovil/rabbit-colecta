import { connect } from 'amqplib';
import dotenv from 'dotenv';
import { logGreen, logRed, logYellow } from '../../../src/funciones/logsCustom.js';
import { formatFechaUTC3 } from '../../../src/funciones/formatFechaUTC3.js';

dotenv.config({ path: process.env.ENV_FILE || '.env' });

const RABBITMQ_URL = process.env.RABBITMQ_URL;
const QUEUE_ESTADOS = process.env.QUEUE_ESTADOS;

export async function sendToShipmentStateMicroService(companyId, userId, shipmentId, latitud, longitud) {
    try {
        const connection = await connect(RABBITMQ_URL);
        const channel = await connection.createChannel();
        await channel.assertQueue(QUEUE_ESTADOS, { durable: true });

        const message = {
            didempresa: companyId,
            didenvio: shipmentId,
            estado: 0,
            subestado: null,
            estadoML: null,
            fecha: formatFechaUTC3(),
            quien: userId,
            operacion: "colecta",
            latitud: latitud,
            longitud: longitud

        };

        channel.sendToQueue(QUEUE_ESTADOS, Buffer.from(JSON.stringify(message)), { persistent: true }, (err, ok) => {
            if (err) {
                logRed(`❌ Error al enviar el mensaje: ${err}`);
            } else {
                logGreen('✅ Mensaje enviado correctamente al microservicio de estados');
            }
            connection.close();
        });
    } catch (error) {
        logRed(`Error en sendToShipmentStateMicroService: ${error.stack}`);
        throw error;
    }
};
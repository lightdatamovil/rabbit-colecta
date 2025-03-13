import { connect } from 'amqplib';
import dotenv from 'dotenv';
import { logRed } from '../../../src/funciones/logsCustom.js';

dotenv.config({ path: process.env.ENV_FILE || '.env' });

const RABBITMQ_URL = process.env.RABBITMQ_URL;
const QUEUE_ESTADOS = process.env.QUEUE_ESTADOS;

export async function sendToShipmentStateMicroService(companyId, userId, shipmentId) {
    try {
        const connection = await connect(RABBITMQ_URL);
        const channel = await connection.createChannel();
        await channel.assertQueue(QUEUE_ESTADOS, { durable: true });

        const message = {
            companyId,
            shipmentId,
            estado: 0,
            subestado: null,
            estadoML: null,
            fecha: new Date().toISOString(),
            userId
        };

        channel.sendToQueue(QUEUE_ESTADOS, Buffer.from(JSON.stringify(message)), { persistent: true });

        connection.close();
    } catch (error) {
        logRed(`Error en sendToShipmentStateMicroService: ${error.message}`);
        throw error;
    }
};
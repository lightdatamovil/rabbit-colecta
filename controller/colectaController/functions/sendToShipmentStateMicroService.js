import { connect } from 'amqplib';
import dotenv from 'dotenv';

dotenv.config({ path: process.env.ENV_FILE || '.env' });

const RABBITMQ_URL = process.env.RABBITMQ_URL;
const QUEUE_ESTADOS = process.env.QUEUE_ESTADOS;

export async function sendToShipmentStateMicroService(companyId, userId, shipmentId, shipmentState, shipmentSubState, shipmentMLState) {
    try {
        const connection = await connect(RABBITMQ_URL);
        const channel = await connection.createChannel();
        await channel.assertQueue(QUEUE_ESTADOS, { durable: true });

        const message = {
            companyId,
            shipmentId,
            shipmentState,
            subestado: shipmentSubState || null,
            estadoML: shipmentMLState || null,
            fecha: new Date().toISOString(),
            userId
        };

        channel.sendToQueue(QUEUE_ESTADOS, Buffer.from(JSON.stringify(message)), { persistent: true });

        connection.close();
    } catch (error) {
        console.error("❌ Error enviando mensaje a RabbitMQ:", error);
        throw error;
    }
};
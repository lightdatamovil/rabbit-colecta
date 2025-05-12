// receive.js
import { connect } from 'amqplib';

async function receive() {
    const connection = await connect('amqp://localhost');
    const channel = await connection.createChannel();

    const queue = 'mi_cola';
    await channel.assertQueue(queue, { durable: true });

    console.log(`← Esperando mensajes en '${queue}'. CTRL+C para salir.`);

    // consume mantiene abierto el canal escuchando
    channel.consume(
        queue,
        msg => {
            if (msg !== null) {
                const text = msg.content.toString();
                console.log(`← Recibido: ${text}`);
                // Confirma que procesaste el mensaje (ACK)
                channel.ack(msg);
            }
        },
        { noAck: false }
    );
}

receive().catch(err => {
    console.error('Error en receive.js:', err);
    process.exit(1);
});

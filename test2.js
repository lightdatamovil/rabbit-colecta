// send.js
import { connect } from 'amqplib';

async function send() {
    // Conéctate al broker RabbitMQ local// en vez de 'amqp://localhost'
    const connection = await connect('amqp://guest:guest@192.168.1.97:5672');

    const channel = await connection.createChannel();

    const queue = 'mi_cola';
    // Asegúrate de que la cola exista (durable = persiste en restart)
    await channel.assertQueue(queue, { durable: true });

    // Toma el mensaje de los argumentos o usa un default
    const msg = process.argv.slice(2).join(' ') || '¡Hola Mundo!';

    // Envía la cola marcándolo como persistente
    channel.sendToQueue(queue, Buffer.from(msg), { persistent: true });
    console.log(`→ Enviado: ${msg}`);

    // Cierra after un momentito para asegurar envío
    setTimeout(() => {
        channel.close();
        connection.close();
    }, 500);
}

send().catch(err => {
    console.error('Error en send.js:', err);
    process.exit(1);
});

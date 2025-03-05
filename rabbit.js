const amqp = require('amqplib');
const { colecta } = require('./controller/asignacionesController');

const RABBITMQ_URL = 'amqp://lightdata:QQyfVBKRbw6fBb@158.69.131.226:5672'; // Cambia según tu configuración
const COLLECTA_QUEUE = 'colecta';



async function startConsumer() {
    try {
        const connection = await amqp.connect(RABBITMQ_URL);
        const channel = await connection.createChannel();

        await channel.assertQueue(COLLECTA_QUEUE, { durable: true });
        console.log(`✅ Esperando mensajes en la cola: ${COLLECTA_QUEUE}`);

        channel.consume(COLLECTA_QUEUE, async (msg) => {
            if (msg !== null) {
                const messageContent = JSON.parse(msg.content.toString());
                try {
                    const dataQR = messageContent.dataQr || messageContent.data || {}; // Asegurar que `dataQR` siempre tenga un valor
                    const responseChannel = messageContent.channel; // Usar directamente `channel`

                    console.log('📩 Mensaje recibido:', messageContent);

                    if (!responseChannel) {
                        console.error('⚠️ No se especificó un canal de respuesta en el mensaje');
                        channel.ack(msg);
                        return;
                    }

                    const resultado = await colecta(dataQR, messageContent);
                    
                    // Asegurarse de que `resultado` no sea `undefined`
                    if (!resultado) {
                        throw new Error("El resultado de la función 'colecta' es undefined");
                    }

                    resultado.feature = "colecta"; // Ahora podemos agregar la propiedad `feature`

                    const sent = channel.sendToQueue(responseChannel, Buffer.from(JSON.stringify(resultado)), { persistent: true });
                    if (sent) {
                        console.log(`✅ Respuesta enviada a ${responseChannel}, respuesta: ${JSON.stringify(resultado)}`);
                    } else {
                        console.error(`⚠️ No se pudo enviar la respuesta a ${responseChannel}`);
                    }
                } catch (error) {
                    console.error("[x] Error al procesar el mensaje:", error);
                    const errorResponse = {
                        feature: messageContent.feature || "unknown",
                        success: false,
                        message: error.message,
                    };

                    channel.sendToQueue(
                        messageContent.channel,
                        Buffer.from(JSON.stringify(errorResponse)),
                        { persistent: true }
                    );
                    console.log("Mensaje enviado al canal", messageContent.channel + ":", errorResponse);
                }
                channel.ack(msg);
            }
        }, { noAck: false });
    } catch (error) {
        console.error('❌ Error al conectar con RabbitMQ:', error);
    }
}

async function sendMessage(queue, message) {
    try {
        const connection = await amqp.connect(RABBITMQ_URL);
        const channel = await connection.createChannel();

        await channel.assertQueue(queue, { durable: true });
        channel.sendToQueue(queue, Buffer.from(JSON.stringify(message)), { persistent: true });

        console.log(`📤 Mensaje enviado a la cola ${queue}:`, message);
        await channel.close();
        await connection.close();
    } catch (error) {
        console.error('❌ Error al enviar el mensaje:', error);
    }
}

startConsumer();

// Ejemplo de uso
const sampleMessage = {
    companyId: 275,
    userId: 2,
    profile: 3,
    autoAssign: false,
    dataQr: {"id":"44429054087","sender_id":413658225,"hash_code":"ZpFyEQnGa+juvrAxbe83sWRg1S+8qZPyOgXGI1ZiqjY=","security_digit":"0"}
    ,
    channel: "respuesta_colecta"
};


sendMessage(COLLECTA_QUEUE, sampleMessage);

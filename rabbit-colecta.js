import { connect } from "amqplib";
import dotenv from "dotenv";
import { colectar } from "./controller/colectaController.js";
import { verifyParameters } from "./src/funciones/verifyParameters.js";
import { getCompanyById, redisClient } from "./db.js";
import {
  logBlue,
  logGreen,
  logPurple,
  logRed,
} from "./src/funciones/logsCustom.js";

dotenv.config({ path: process.env.ENV_FILE || ".env" });

const RABBITMQ_URL = process.env.RABBITMQ_URL;
const QUEUE_NAME_COLECTA = process.env.QUEUE_NAME_COLECTA;
const RECONNECT_INTERVAL = 5000;

let connection;
let channel;
let reconnecting = false;

const responseQueueOptions = {
  durable: false,
  autoDelete: true,
};

async function createConnection() {
  if (reconnecting) return;
  reconnecting = true;

  try {
    if (!redisClient.isOpen) {
      await redisClient.connect();
    }

    await closeConnection();

    connection = await connect(RABBITMQ_URL);
    logGreen("✅ Conectado a RabbitMQ");

    connection.on("error", (err) => {
      logRed("💥 Error en conexión:", err.message);
    });

    connection.on("close", async () => {
      if (!reconnecting) {
        logRed("⚠️ Conexión cerrada. Intentando reconectar...");
        await closeConnection();
        setTimeout(() => createConnection(), RECONNECT_INTERVAL);
      }
    });

    channel = await connection.createChannel();
    await channel.assertQueue(QUEUE_NAME_COLECTA, { durable: true });

    logBlue(`🎧 Escuchando mensajes en "${QUEUE_NAME_COLECTA}"`);
    startConsuming(channel);
  } catch (error) {
    logRed(`❌ Error conectando: ${error.message}`);
    setTimeout(() => createConnection(), RECONNECT_INTERVAL);
  } finally {
    reconnecting = false;
  }
}

async function closeConnection() {
  try {
    if (channel) {
      try {
        await channel.close();
      } catch (err) {
        logRed("🔻 Error al cerrar canal:", err.message);
      }
      channel = null;
    }
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        logRed("🔻 Error al cerrar conexión:", err.message);
      }
      connection = null;
    }
  } catch (err) {
    logRed("🔻 Error inesperado al cerrar conexión vieja:", err.message);
  }
}

async function sendToResponseQueue(queueName, payload) {
  let tempChannel;
  try {
    tempChannel = await connection.createChannel();
    await tempChannel.assertQueue(queueName, responseQueueOptions);
    await tempChannel.sendToQueue(
      queueName,
      Buffer.from(JSON.stringify(payload)),
      { persistent: true }
    );
    logGreen(`📤 Enviado a ${queueName}`);
  } catch (err) {
    logRed(`❌ Error enviando mensaje a ${queueName}: ${err.message}`);
  } finally {
    if (tempChannel) {
      try {
        await tempChannel.close();
      } catch (err) {
        logRed(`⚠️ Error al cerrar canal temporal: ${err.message}`);
      }
    }
  }
}

function startConsuming(channel) {
  channel.consume(QUEUE_NAME_COLECTA, async (msg) => {
    const startTime = performance.now();
    if (!msg) return;

    const body = JSON.parse(msg.content.toString());

    try {
      logGreen(`📩 Mensaje recibido: ${JSON.stringify(body, null, 2)}`);
      //   channel.ack(msg);
      const errorMessage = verifyParameters(body, [
        "dataQr",
        "autoAssign",
        "channel",
      ]);
      if (errorMessage) throw new Error(errorMessage);

      const company = await getCompanyById(body.companyId);
      const dataQr = JSON.parse(body.dataQr);

      const result = await colectar(
        startTime,
        company,
        dataQr,
        body.userId,
        body.profile,
        body.autoAssign,
        body
      );
      result.feature = "colecta";

      await channel.assertQueue(body.channel, responseQueueOptions);
      channel.sendToQueue(body.channel, Buffer.from(JSON.stringify(result)), {
        persistent: true,
      });
      logGreen(`📤 Enviado a ${body.channel}`);
    } catch (error) {
      logRed(`❌ Error procesando mensaje: ${error.stack}`);
      const fallback = {
        feature: "colecta",
        estadoRespuesta: false,
        mensaje: error.stack,
        error: true,
      };
      await channel.assertQueue(body.channel, responseQueueOptions);
      channel.sendToQueue(body.channel, Buffer.from(JSON.stringify(fallback)), {
        persistent: true,
      });
    } finally {
      const endTime = performance.now();
      logPurple(
        `⏱ Tiempo de ejecución: ${(endTime - startTime).toFixed(2)} ms`
      );
      channel.ack(msg);
    }
  });
}

createConnection();

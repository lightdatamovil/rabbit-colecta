const { iniciarProceso, executeQuery,redisClient } = require("../db");
const axios = require('axios');
const mysql = require('mysql');
const amqp = require('amqplib');
const RABBITMQ_URL = 'amqp://lightdata:QQyfVBKRbw6fBb@158.69.131.226:5672';
const QUEUE_NAME = 'pruebasestados';


function generarMensaje(didempresa, didenvio, estado, subestado = null, estadoML = null, quien) {
    return {
        didempresa,
        didenvio,
        estado,
        subestado: subestado || null,
        estadoML: estadoML || null,
        fecha: new Date().toISOString(), // Fecha actual en formato ISO 8601
        quien
    };
}
const enviarAMQPRabbit = async (didempresa, didenvio, estado, subestado, estadoML, quien) => {
    try {
        const connection = await amqp.connect(RABBITMQ_URL);
        const channel = await connection.createChannel();
        await channel.assertQueue(QUEUE_NAME, { durable: true });

        const mensaje = generarMensaje(didempresa, didenvio, estado, subestado, estadoML, quien);
        channel.sendToQueue(QUEUE_NAME, Buffer.from(JSON.stringify(mensaje)), { persistent: true });

        console.log("✅ Mensaje enviado a RabbitMQ:", mensaje);

        setTimeout(() => {
            connection.close();
        }, 500);
    } catch (error) {
        console.error("❌ Error enviando mensaje a RabbitMQ:", error);
    }
};
async function enviarAsignacion(payload) {
    try {
        const response = await axios.post('https://asignaciones.lightdata.app/api/asignaciones/asignar', payload);
        console.log('Respuesta del servidor:', response.data);
        
    } catch (error) {
        console.error('Error al hacer la solicitud POST:', error);
        throw new Error("Error al asignar paquete al chofer - NOFLEX");
    }
}

async function sendToRedisML(jsonData) {
    try {
        const response = await axios.post('https://altaenvios.lightdata.com.ar/api/enviosMLredis', jsonData, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return response.data;
    } catch (error) {
        console.error('Error enviando datos a Redis ML:', error);
        throw error;
    }
}
async function informe(perfil, quien, connection) {
    const sql = `
        SELECT COUNT(eh.id) as total, CONCAT(su.nombre, ' ', su.apellido) as cadete
        FROM envios_historial as eh
        JOIN sistema_usuarios as su ON (su.elim = 0 AND su.superado = 0 AND su.did = eh.quien)
        WHERE eh.superado = 0 AND eh.estado = 0 AND eh.quien = ?
        GROUP BY eh.quien
    `;

    return new Promise((resolve, reject) => {
        connection.query(sql, [quien], (err, result) => {
            if (err) {
                return reject(err);
            }

            const row = result[0] || {};
            resolve({
                namecliente: row.cadete || "",
                aretirar: row.total || 0
            });
        });
    });
}
async function informePro(perfil, quien, connection) {
    const hoy = new Date().toISOString().split('T')[0] + " 00:00:00";
    
    const sqlColectados = `
        SELECT COUNT(id) as total 
        FROM envios_historial 
        WHERE autofecha > ? AND estado = 1
    `;
    const sqlNuevosColectados = `
        SELECT COUNT(id) as total 
        FROM envios 
        WHERE fecha_inicio > ? AND superado = 0 AND elim = 0
    `;
    
    try {
        const resultColectados = await executeQuery(connection, sqlColectados, [hoy]);
        const colectados = resultColectados[0]?.total || 0;
        
        const resultNuevosColectados = await executeQuery(connection, sqlNuevosColectados, [hoy]);
        const nuevosColectados = resultNuevosColectados[0]?.total || 0;
        
        return {
            colectados: colectados.toString(),
            nuevosColectados: nuevosColectados.toString()
        };
    } catch (error) {
        throw error;
    }
}

async function obtenerMisCuentas(connection, GLOBAL_empresa_id) {
    let Amiscuentas = {};

    // Realizar la consulta a la base de datos
    const sql = `
        SELECT did, didCliente, ML_id_vendedor 
        FROM clientes_cuentas 
        WHERE superado = 0 AND elim = 0 AND tipoCuenta = 1
    `;
    const result = await executeQuery(connection, sql);
    
    result.forEach(row => {
        // Aquí se usa `ML_id_vendedor` como clave principal
        Amiscuentas[GLOBAL_empresa_id] = {
               didcliente: row.didCliente,
               didcuenta: row.did
        };
    });

    // Retornar los resultados como caché
    return Amiscuentas;
}


function empresaDuenia(codigoBuscado, AempresasGlobal) {
    if (!AempresasGlobal) {
        console.error("AempresasGlobal no está definido");
        return null;
    }
console.log("codigobuscado",codigoBuscado);

    // Iterar sobre las claves del objeto
    for (const key in AempresasGlobal) {
        if (AempresasGlobal[key].codigo === codigoBuscado) {
            const e = AempresasGlobal[key]; // Asignar la empresa encontrada
            return e; // Retornar la empresa encontrada
        }
    }
    console.error(`No se encontró la empresa con el código: ${codigoBuscado}`);
    return null;
}

async function insertoDataQR(didEnvio, AdataQR, connection) {
    const ml_qr_seguridad = JSON.stringify(AdataQR);
    const sql = `
        UPDATE envios 
        SET ml_qr_seguridad = ?
        WHERE superado = 0 AND elim = 0 AND did = ?
        LIMIT 1
    `;

    try {
        const result = await executeQuery(connection, sql, [ml_qr_seguridad, didEnvio]);
        return result.affectedRows > 0;
    } catch (error) {
        throw error;
    }
}

async function insertarPaquete(didcliente, didcuenta, AdataQR, connection, flex, externo, idempresa) {
    const GLOBAL_empresa_id = idempresa;
    const lote = generarLoteExterno();
    const fecha_inicio = new Date().toISOString().slice(0, 19).replace('T', ' ');
    let idnuevo = -1;
    const quien = 1;
    const did = 0;
    const idshipment = AdataQR.id;
    const senderid = AdataQR.sender_id;
    const ml_qr_seguridad = JSON.stringify(AdataQR);
    const fechaunix = Math.floor(Date.now() / 1000);

    const sql = `
        INSERT INTO envios (did, ml_shipment_id, ml_vendedor_id, didCliente, quien, lote, didCuenta, ml_qr_seguridad, fecha_inicio, flex, exterior, fechaunix)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    try {
        const result = await executeQuery(connection, sql, [did, idshipment, senderid, didcliente, quien, lote, didcuenta, ml_qr_seguridad, fecha_inicio, flex, externo, fechaunix]);
        idnuevo = result.insertId;

        if (idnuevo > -1) {
            const dataredis = {
                idEmpresa: GLOBAL_empresa_id,
                estado: 0,
                did: idnuevo,
                ml_shipment_id: idshipment,
                ml_vendedor_id: senderid
            };

            try {
                await sendToRedisML(dataredis);
            } catch (error) {
                console.error('Error enviando a Redis ML:', error);
            }

            const updateSql = `
                UPDATE envios 
                SET did = ? 
                WHERE superado = 0 AND elim = 0 AND id = ? 
                LIMIT 1
            `;
            await executeQuery(connection, updateSql, [idnuevo, idnuevo]);
        }

        return idnuevo;
    } catch (error) {
        throw error;
    }
}


async function ponerRetirado(didpaquete, connection, didquien) {
    const fecha = new Date().toISOString().slice(0, 19).replace('T', ' ');


    // Simular $_SESSION["user"]
    global.session = global.session || {};
    global.session["user"] = didquien;

    return await fsetestadoConector(didpaquete, 0, fecha, connection);
}
async function fsetestadoConector(did, estado, fecha, connection) {
    try {
        const quien = global.session?.user || 0;
        const sqlEstado = `
            SELECT estado 
            FROM envios_historial 
            WHERE didEnvio = ? AND superado = 0 AND elim = 0
        `;
        
        const results = await executeQuery(connection, sqlEstado, [did]);
        const estadoActual = results.length > 0 ? results[0].estado : -1;
        
        if (estadoActual === 5 || estadoActual === 9 || estadoActual === estado) {
            return { estadoRespuesta: false, mensaje: "No se pudo actualizar el estado." };
        }
        
        const sqlSuperado = `
            UPDATE envios_historial 
            SET superado = 1 
            WHERE superado = 0 AND didEnvio = ?
        `;
        await executeQuery(connection, sqlSuperado, [did]);
        
        const sqlActualizarEnvios = `
            UPDATE envios 
            SET estado_envio = ? 
            WHERE superado = 0 AND did = ?
        `;
        await executeQuery(connection, sqlActualizarEnvios, [estado, did]);
        
        const sqlDidCadete = `
            SELECT operador 
            FROM envios_asignaciones 
            WHERE didEnvio = ? AND superado = 0 AND elim = 0
        `;
        const cadeteResults = await executeQuery(connection, sqlDidCadete, [did]);
        const didCadete = cadeteResults.length > 0 ? cadeteResults[0].operador : 0;
        const fechaT = fecha || new Date().toISOString().slice(0, 19).replace('T', ' ');
        
        const sqlInsertHistorial = `
            INSERT INTO envios_historial (didEnvio, estado, quien, fecha, didCadete) 
            VALUES (?, ?, ?, ?, ?)
        `;
        await executeQuery(connection, sqlInsertHistorial, [did, estado, quien, fechaT, didCadete]);
        
        return { estadoRespuesta: true, mensaje: "Se guardó correctamente" };
    } catch (error) {
        console.error("Error en fsetestadoConector:", error);
        throw error;
    }
}


async function crearVinculacion(didpaquete_ext, didpaquete_local, connection, flex, nameexterno, idempresaExerna) {
    const sql = `
        INSERT INTO envios_exteriores (didLocal, didExterno, flex, cliente, didEmpresa)
        VALUES (?, ?, ?, ?, ?)
    `;
    try {
        const result = await executeQuery(connection, sql, [didpaquete_local, didpaquete_ext, flex, nameexterno, idempresaExerna]);
        return result.insertId;
    } catch (error) {
        throw error;
    }
}
function generarLoteExterno() {
    return Math.random().toString(36).substring(2, 15);
}

function createDBConnection(AdataDB) {
    return mysql.createConnection({
        host: "bhsmysql1.lightdata.com.ar",
        user: AdataDB.dbuser,
        password: AdataDB.dbpass,
        database: AdataDB.dbname
    });
}

function processDataQR(dataQR) {
    let AdataQR;
    if (typeof dataQR === 'object' && dataQR !== null) {
        AdataQR = dataQR;
    } else {
        dataQR = dataQR.replace(/ /g, "");
        AdataQR = JSON.parse(dataQR);
    }
    return AdataQR;
}

async function handleFlexLogic(AdataQR, connection, AempresasGlobal, GLOBAL_empresa_id, Amiscuentas, quienpaquete, autoasignar, body) {
    const senderid = String(AdataQR.sender_id || "").replace(/ /g, "");
    const idshipment = AdataQR.id;
    let didcliente = -1;
    let didcuenta = -1;
    let didpaquete = -1;
    let estado_envio = -1;
    let paquetecargado = false;
    let tengoQR = false;
   autoasignar= body.autoAssign
 
   
    
    // Verificar si el paquete es de la empresa
    if (Amiscuentas[GLOBAL_empresa_id][senderid]) {


        
        didcliente = Amiscuentas[senderid].didcliente;
        didcuenta = Amiscuentas[GLOBAL_empresa_id][senderid].didcuenta;
    }

    const sql = `
        SELECT did, estado_envio, didCliente, didCuenta, ml_qr_seguridad 
        FROM envios 
        WHERE superado = 0 AND elim = 0 AND ml_shipment_id = ? AND ml_vendedor_id = ? 
        LIMIT 1
    `;
    const result = await executeQuery(connection, sql, [idshipment, senderid]);
    const row = result[0];

    


    if (row) {
        didpaquete = row.did;
        estado_envio = row.estado_envio * 1;
       didcliente = row.didCliente;
        didcuenta = row.didCuenta;
        if (row.ml_qr_seguridad !== '') tengoQR = true;
        paquetecargado = false;
    }

    // Verificar si el paquete ya ha sido colectado
    if (didpaquete !== -1) {
        const sqlColectado = `
            SELECT id, estado 
            FROM envios_historial 
            WHERE didEnvio = ? LIMIT 1
        `;
        const rowsColectado = await executeQuery(connection, sqlColectado, [didpaquete]);

        if (rowsColectado.length > 0 && rowsColectado[0].estado == 0) {
            return { estadoRespuesta: false, mensaje: "El paquete ya se encuentra colectado - FLEX" };
        }
    }

    // Lógica para manejar paquetes externos
    if (didcliente === -1) {
        const Aempresasext = await iniciarProceso();
        
        const Aexternas = [];
        const sqlExternas = `
            SELECT did, nombre_fantasia, codigoVinculacionLogE 
            FROM clientes 
            WHERE superado = 0 AND elim = 0 AND codigoVinculacionLogE != ''
        `;
        const rowsExternas = await executeQuery(connection, sqlExternas);
        rowsExternas.forEach(row => Aexternas.push(row));

        let paqueteExternoInsertdo = false;

        for (const clienteexterno of Aexternas) {
            const codigovinculacion = clienteexterno.codigoVinculacionLogE;
            console.log(codigovinculacion, "codigo");
            
            const dataEmpresaExterna = await empresaDuenia(codigovinculacion, Aempresasext);
            
            const connectionE = createDBConnection(dataEmpresaExterna);
            const didclienteLocal_ext = clienteexterno.did;


            const idempresaExterna = dataEmpresaExterna.id;
            const nombre_fantasia = clienteexterno.nombre_fantasia;

            if (dataEmpresaExterna) {
                const connectionE = createDBConnection(dataEmpresaExterna);
                const sqlCuentas = `
                    SELECT did, didCliente 
                    FROM clientes_cuentas 
                    WHERE superado = 0 AND elim = 0 AND tipoCuenta = 1 AND ML_id_vendedor = ?
                `;
                const rowsCuentas = await executeQuery(connectionE, sqlCuentas, [senderid]);

                if (rowsCuentas.length > 0) {
                    const didcliente_ext = rowsCuentas[0].didCliente;
                    const didcuenta_ext = rowsCuentas[0].did;

                    const sqlEnvios = `
                        SELECT did, estado_envio, didCliente, didCuenta 
                        FROM envios 
                        WHERE superado = 0 AND elim = 0 AND ml_shipment_id = ? AND ml_vendedor_id = ? 
                        LIMIT 1
                    `;
                    const rowsEnvios = await executeQuery(connectionE, sqlEnvios, [idshipment, senderid]);

                    let didpaquete_ext = -1;
                    if (rowsEnvios.length > 0) {
                        didpaquete_ext = rowsEnvios[0].did;
                    } else {
                        didpaquete_ext = await insertarPaquete(didcliente_ext, didcuenta_ext, AdataQR, connectionE, 1, 0, idempresaExterna);
                    }

                    if (didpaquete_ext !== -1) {
                        const didpaquete_local = await insertarPaquete(didclienteLocal_ext, 0, AdataQR, connection, 1, 1, GLOBAL_empresa_id);
                        await crearVinculacion(didpaquete_ext, didpaquete_local, connection, 1, nombre_fantasia, idempresaExterna);

                        const sqlChofer = `
                            SELECT usuario 
                            FROM sistema_usuarios_accesos 
                            WHERE superado = 0 AND elim = 0 AND codvinculacion = ?
                        `;
                        const rowsChofer = await executeQuery(connectionE, sqlChofer, ["cogote"]);
                        const didchofer = rowsChofer.length > 0 ? rowsChofer[0].usuario : -1;
                    
                        if(rowsEnvios[0].estado_envio === 0){
                            return { estadoRespuesta: false, mensaje: "Paquete ya colectado" };}

                        if (didchofer>-1) {
                            if (autoasignar) {
                                console.log(autoasignar, "AUTOASIGNAR ");
                    
                                // Definir el cuerpo de la solicitud
                                const payload = {
                                    companyId: dataEmpresaExterna.id,
                                    userId: body.userId,
                                    profile: body.profile,
                                    appVersion: "null",
                                    brand: "null",
                                    model: "null",
                                    androidVersion: "null",
                                    deviceId: "null",
                                    dataQr: {
                                        id: '44429054087',
                                        sender_id: 413658225,
                                        hash_code: 'ZpFyEQnGa+juvrAxbe83sWRg1S+8qZPyOgXGI1ZiqjY=',
                                        security_digit: '0'

                                    },
                                    driverId: didchofer,
                                    deviceFrom: "Autoasignado de colecta"
                                };
                                console.log(payload);
                    
                                try {
                                    // Realizar la solicitud POST
                                    const response = await axios.post('https://asignaciones.lightdata.app/api/asignaciones/asignar', payload);
                                    console.log('Respuesta del servidor:', response.data);
                                } catch (error) {
                                    console.error('Error al hacer la solicitud POST:', error);
                                    return { estadoRespuesta: false, mensaje: "Error al asignar paquete al chofer - NOFLEX" };
                                }
                            }

                       
                            await ponerRetirado(didpaquete_local, connection, quienpaquete);


                            if (autoasignar) {
                                console.log(autoasignar, "AUTOASIGNAR ");
                    
                               
                                const payload = {
                                    companyId: body.companyId,
                                    userId: body.userId,
                                    profile: body.profile,
                                    appVersion: "null",
                                    brand: "null",
                                    model: "null",
                                    androidVersion: "null",
                                    deviceId: "null",
                                    dataQr: {
                                        id: '44429054087',
                                        sender_id: 413658225,
                                        hash_code: 'ZpFyEQnGa+juvrAxbe83sWRg1S+8qZPyOgXGI1ZiqjY=',
                                        security_digit: '0'

                                    },
                                    driverId: body.userId,
                                    deviceFrom: "Autoasignado de colecta"
                                };
                                console.log(payload);
                    
                              await enviarAsignacion(payload)
                            }

                            await ponerRetirado(didpaquete_ext, connectionE, didchofer);
                           paqueteExternoInsertdo = true;
                           return { estadoRespuesta: true, mensaje: "Paquete colectado correctamente - FLEX" };
                           
                        }

                      
                    }
                        
                }
                await connectionE.end();
            }
        }

        if (!paqueteExternoInsertdo) {
            return { estadoRespuesta: false, mensaje: "Error al querer insertar el paquete1 (FE) - FLEX" };
        }
    } else {
        // Lógica para manejar paquetes de la empresa
        if (!paquetecargado) {
            if (estado_envio === 0) {console.log("dsadad");
            
                return { estadoRespuesta: false, mensaje: "El paquete ya se encuentra colectado - FLEX" };
            } else {
            
                if (autoasignar) {
                    console.log(autoasignar, "AUTOASIGNAR ");
        
                
                    const payload = {
                        companyId: body.companyId,
                        userId: body.userId,
                        profile: body.profile,
                        appVersion: "null",
                        brand: "null",
                        model: "null",
                        androidVersion: "null",
                        deviceId: "null",
                        dataQr: AdataQR,
                        driverId: body.userId,
                        deviceFrom: "Autoasignado de colecta"
                    };
                    console.log(payload);
        
                    await enviarAsignacion(payload)
                }
            
                const ok = await ponerRetirado(didpaquete, connection, quienpaquete);
                if (ok) {
                    return { estadoRespuesta: true, mensaje: "Paquete colectado correctamente - FLEX" };
                } else {
                    return { estadoRespuesta: false, mensaje: "Error al poner el paquete como retirado - FLEX" };
                }
            }
        } else {
            const didpaquete_local = await insertarPaquete(didcliente, 0, AdataQR, connection, 1, 0, GLOBAL_empresa_id);
            await insertoDataQR(didpaquete_local, AdataQR, connection);

            if (didpaquete_local !== -1) {
        console.log(didpaquete,"fsdfsdfsdfsdf");
        
                
                const ok = await ponerRetirado(didpaquete, connection, quienpaquete);
                if (body.autoAssign) {
                    const payload = {
                        companyId: body.companyId,
                        userId: body.userId,
                        profile: body.profile,
                        appVersion: "null",
                        brand: "null",
                        model: "null",
                        androidVersion: "null",
                        deviceId: "null",
                        dataQr: AdataQR,
                        driverId: body.userId,
                        deviceFrom: "Autoasignado de colecta"
                    };
                    console.log(payload);
        
                    await enviarAsignacion(payload)
                   
                }
                if (ok) {
                    return { estadoRespuesta: true, mensaje: "Paquete insertado y colectado - FLEX" };
                } else {
                    return { estadoRespuesta: false, mensaje: "Error al poner el paquete como retirado - FLEX" };
                }
            } else {
                return { estadoRespuesta: false, mensaje: "Error al insertar el paquete - FLEX" };
            }
        }
    }
}

async function handleNoFlexLogic(AdataQR, connection, GLOBAL_empresa_id, quienpaquete, autoasignar, body) {
    const esmio = (GLOBAL_empresa_id === AdataQR.empresa);
    const didclientePaquete = AdataQR.cliente;
    const didenvioPaquete = AdataQR.did;
    let todobien = false;
    const esaplantanormal = false;
    console.log(esmio);

    if (esmio) {
        const autoasignar = body.autoAssign;

        const paqueteColectado = await executeQuery(connection, `
            SELECT id, estado FROM envios_historial WHERE didEnvio = ? AND estado = 0
        `, [didenvioPaquete]);

        if (paqueteColectado.length > 0 && paqueteColectado.estado == 0) {
            return { estadoRespuesta: false, mensaje: "El paquete ya se encuentra colectado - NOFLEX" };
        }

        const estadoPaquete = await executeQuery(connection, `
            SELECT estado_envio FROM envios WHERE superado = 0 AND elim = 0 AND did = ? LIMIT 1
        `, [didenvioPaquete]);
        console.log("jfndsjnfsd", estadoPaquete);

        if (estadoPaquete.length === 0) {
            return { estadoRespuesta: false, mensaje: "Paquete no encontrado - NOFLEX" };
        }

        if (estadoPaquete[0].estado_envio === 0) {
            return { estadoRespuesta: false, mensaje: "El paquete ya se encuentra retirado - NOFLEX" };
        }

        // Aquí realizamos la solicitud POST en lugar de llamar a la función asignarPaqueteChofer
        if (autoasignar) {
            const payload = {
                companyId: body.companyId,
                userId: body.userId,
                profile: body.profile,
                appVersion: "null",
                brand: "null",
                model: "null",
                androidVersion: "null",
                deviceId: "null",
                dataQr:
                    AdataQR
                ,
                driverId: body.userId,
                deviceFrom: "Autoasignado de colecta"
            };
            console.log(payload);
            await enviarAsignacion(payload)
        }

      

        await enviarAMQPRabbit(GLOBAL_empresa_id, AdataQR.did, 0, null, null, body.userId);
        const ok = await ponerRetirado(didenvioPaquete, connection, quienpaquete);

        return ok
            ? { estadoRespuesta: true, mensaje: "Paquete colectado correctamente - NOFLEX" }
            : { estadoRespuesta: false, mensaje: "Error al poner el paquete como retirado - NOFLEX" };
    }


    // Lógica si no es mío
    let yaestacargado = false;
    let didenvio = 0;
    const Aempresasext = await iniciarProceso();
    const empresaExterna = Aempresasext[AdataQR.empresa];
    const connectionext = createDBConnection(empresaExterna);

    const paqueteExterno = await executeQuery(connection, `
        SELECT didLocal FROM envios_exteriores WHERE superado = 0 AND elim = 0 AND didExterno = ? AND didEmpresa = ?
    `, [didenvioPaquete, empresaExterna.id]);



    if (paqueteExterno.length > 0) {
        didenvio = paqueteExterno[0].didLocal;
        yaestacargado = true;
    }

    if (!yaestacargado) {
        const clientesExternos = await executeQuery(connectionext, `
            SELECT did, nombre_fantasia, codigoVinculacionLogE FROM clientes WHERE superado = 0 AND elim = 0 AND codigoVinculacionLogE != ''
        `);
        let procesado = false;
        const autoasignar = body.autoAssign;
        for (const cliente of clientesExternos) {
            console.log(clientesExternos, "ext");
            console.log();

            const codigovinculacion = cliente.codigoVinculacionLogE;
            console.log(codigovinculacion, "codigo");

            const empresaDueña = await empresaDuenia(codigovinculacion, Aempresasext);

            if (!empresaDueña) continue;

            const didlocal = await insertarPaquete(cliente.did, 0, { id: "", sender_id: "" }, connection, 0, 1, empresaDueña.id);


            const nombreFantasiaExterno = await executeQuery(connectionext, `
                SELECT cl.nombre_fantasia FROM envios AS e
                JOIN clientes AS cl ON cl.did = e.didCliente
                WHERE e.did = ?
            `, [didenvioPaquete]);

            await crearVinculacion(didenvioPaquete, didlocal, connection, 0, nombreFantasiaExterno[0]?.nombre_fantasia || "", AdataQR.empresa);
            console.log(empresaDueña.codigo, "empresa duenaaaa");

            const chofer = await executeQuery(connectionext, `
                SELECT usuario FROM sistema_usuarios_accesos WHERE codvinculacion = ?
            `, [empresaDueña.codigo]);

            if (chofer.length > 0) {


                const payload = {
                    companyId: AdataQR.empresa,
                    userId: body.userId,
                    profile: body.profile,
                    appVersion: "null",
                    brand: "null",
                    model: "null",
                    androidVersion: "null",
                    deviceId: "null",
                    dataQr:
                        AdataQR
                    ,
                    driverId: chofer[0].usuario,
                    deviceFrom: "Autoasignado de colecta"
                };
                if(autoasignar){

                    await enviarAsignacion(payload)

                }
                const paqueteExterno = await executeQuery(connection, `
                SELECT didLocal FROM envios_exteriores WHERE superado = 0 AND elim = 0 AND didExterno = ? AND didEmpresa = ?
            `, [didenvioPaquete, empresaExterna.id]);


                await enviarAMQPRabbit(GLOBAL_empresa_id, didclientePaquete, 0, null, null, body.userId);
                await ponerRetirado(didlocal, connection, quienpaquete);
                if (autoasignar) {

                    const payload = {
                        companyId: body.companyId,
                        userId: body.userId,
                        profile: body.profile,
                        appVersion: "null",
                        brand: "null",
                        model: "null",
                        androidVersion: "null",
                        deviceId: "null",
                        dataQr:
                        {
                            local: AdataQR.local,
                            did: paqueteExterno[0].didLocal,
                            cliente: AdataQR.cliente,
                            empresa: body.companyId

                        }
                        ,
                        driverId: body.userId,
                        deviceFrom: "Autoasignado de colecta"
                    };
                    await enviarAsignacion(payload)
                }
                await enviarAMQPRabbit(AdataQR.cliente, AdataQR.did, 0, null, null, chofer[0].usuario);
                await ponerRetirado(didenvioPaquete, connectionext, chofer[0].usuario);
                procesado = true;
            }
        }

        if (!procesado) return { estadoRespuesta: false, mensaje: "Error al querer insertar el paquete (FE)" };
        todobien = true;
    } else {
        const estadoExterno = await executeQuery(connection, `
            SELECT estado_envio FROM envios WHERE did = ? LIMIT 1
        `, [didenvio]);
        const estadoLocal = await executeQuery(connectionext, `
            SELECT estado_envio FROM envios WHERE did = ? LIMIT 1
        `, [didenvio]);


        if (estadoExterno.length > 0 && estadoExterno[0].estado_envio === 0) {
            return { estadoRespuesta: false, mensaje: "El paquete ya se encuentra colectado E2" };
        }
        const ok = await ponerRetirado(didenvio, connection, quienpaquete);
        if (!ok) return { estadoRespuesta: false, mensaje: "Error al querer retirar el paquete (NOL2)" };
        todobien = true;
    }

    // Informes
    if (todobien) {
        if (!esaplantanormal) {
            await informePro(body.profile, body.userId, connection);
            return { estadoRespuesta: true, mensaje: "Paquete colectado con exito " };
        }
        return { estado: true, mensaje: "Paquete ingresado" };
    }
}

async function colecta(dataQR, body) {
    const Aempresas2 = await iniciarProceso();
    const AdataDB = Aempresas2[body.companyId];
    const connection = createDBConnection(AdataDB);
    const AempresasGlobal = Aempresas2 || {};
    const GLOBAL_empresa_id = body.companyId || 0;
    const globalAmiscuentas = {}
    const AdataQR = processDataQR(dataQR);
    let response;
    let Amiscuentas = await obtenerMisCuentas(connection,GLOBAL_empresa_id)
    if (dataQR.sender_id) {

    
    
        response = await handleFlexLogic(AdataQR, connection, AempresasGlobal, GLOBAL_empresa_id, Amiscuentas, global.userId, body.autoAssign,body);
    } else {
        response = await handleNoFlexLogic(AdataQR, connection, GLOBAL_empresa_id, body.userId, body.autoAssign, body);
    }
    connection.end();
    return response;
}
module.exports = { colecta };
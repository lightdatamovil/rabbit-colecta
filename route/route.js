const express = require('express');
const { colecta } = require('../controller/asignacionesController');
const colecta2 = express.Router(); // CORREGIDO: No se necesita require de otro archivo

colecta2.post('/procesarQR2', async (req, res) => {
    try {
        const dataQR = req.body.dataQR || req.body.data;
        console.log(dataQR);

        // Suponiendo que `colecta` es una función que necesitas importar y ejecutar
        const resultado = await colecta(dataQR, req); // Cambia `colecta` por la función correcta

        return res.json(resultado);
    } catch (error) {
        console.error('Error en procesarQR2:', error);
        return res.status(500).json({ estado: false, mensaje: "Error en el procesamiento" });
    }
});

module.exports = colecta2; // CORREGIDO: Exportar correctamente el router

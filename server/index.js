import express from 'express'
import { Server } from 'socket.io'
import { createServer } from 'node:http'
import dotenv from 'dotenv'
import { createClient } from '@libsql/client'

dotenv.config()

const port = process.env.PORT ?? 3000

const app = express()
const server = createServer(app)
const io = new Server(server, {
  connectionStateRecovery: {},
})

// crear conexión a la base de datos
const db = createClient({
  url: 'libsql://cosmic-king-bedlam-jesuswav.turso.io',
  authToken: process.env.DB_TOKEN,
})

await db.execute(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT,
    user TEXT
  )
`)

// iniciamos la conexión bidireccional
// entre los clientes
io.on('connection', async (socket) => {
  console.log('A user has connected')

  // identificar cuando el cliente se ha desconectado
  socket.on('disconnect', () => {
    console.log('A user had disconnected')
  })

  // enviar los mensajes enviados a todos los clientes
  socket.on('chat message', async (msg) => {
    // guardar el registro en la base de datos
    let result
    let username = socket.handshake.auth.username ?? 'anonymous'
    try {
      result = await db.execute({
        sql: `INSERT INTO messages (content, user) VALUES (:msg, :username)`,
        args: { msg, username },
      })
    } catch (e) {
      console.error(e)
    }
    io.emit('chat message', msg, result.lastInsertRowid.toString(), username)
  })

  console.log('Auth ⬇️')
  console.log(socket.handshake.auth)

  if (!socket.recovered) {
    // <-- recuperar los mensajes sin conexión
    try {
      const results = await db.execute({
        sql: 'SELECT  id, content, user FROM messages WHERE id > ? ',
        args: [socket.handshake.auth.serverOffset ?? 0],
      })

      results.rows.forEach((row) => {
        socket.emit('chat message', row.content, row.id.toString(), row.user)
      })
    } catch (e) {
      console.error(e)
    }
  }
})

// enviamos el index.html
app.get('/', (req, res) => {
  res.sendFile(process.cwd() + '/client/index.html')
})

server.listen(port, () => {
  console.log(`Server running on port ${port}`)
})

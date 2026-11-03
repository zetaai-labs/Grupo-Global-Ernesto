import app from './app.js'

const port = process.env.PORT || 5000

app.listen(port, () => {
  console.log(`Backend testing server is running at http://localhost:${port}`)
})

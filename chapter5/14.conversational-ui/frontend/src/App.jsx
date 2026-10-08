import { useState } from 'react'
import './theme.css'

export default function App() {
  const [count, setCount] = useState(0)
  return (
    <div className="page">
      <h1 className="title">我的应用</h1>
      <p className="subtitle">欢迎使用，点击下面的按钮试试</p>
      <button className="btn" onClick={() => setCount(count + 1)}>
        点击了 {count} 次
      </button>
    </div>
  )
}

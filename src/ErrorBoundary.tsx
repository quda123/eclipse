import { Component, type ErrorInfo, type ReactNode } from 'react'

export class ErrorBoundary extends Component<{children:ReactNode},{failed:boolean}>{
  state={failed:false}
  static getDerivedStateFromError(){return{failed:true}}
  componentDidCatch(error:Error,info:ErrorInfo){if(import.meta.env.DEV)console.error('Ошибка интерфейса',error.name,info.componentStack)}
  render(){if(this.state.failed)return <main className="auth-screen"><section className="auth-card" role="alert"><h1>Что-то пошло не так</h1><p>Обновите страницу. Если ошибка повторится, проверьте соединение и обратитесь к преподавателю.</p><button className="cta" onClick={()=>location.reload()}>Обновить страницу</button></section></main>;return this.props.children}
}

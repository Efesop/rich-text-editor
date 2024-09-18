import RichTextEditor from '../components/RichTextEditor'

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-100">
      <main className="container mx-auto py-8">
        <h1 className="text-3xl font-bold mb-8 text-center text-gray-800">Rich Text Editor</h1>
        <div className="bg-white shadow-lg rounded-lg overflow-hidden">
          <RichTextEditor />
        </div>
      </main>
    </div>
  )
}
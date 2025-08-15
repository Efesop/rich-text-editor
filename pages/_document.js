 import Document, { Html, Head, Main, NextScript } from 'next/document'

 export default class MyDocument extends Document {
   render () {
     const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ''
     
     return (
       <Html lang='en'>
         <Head>
           <meta name='theme-color' content='#111827' />
           <link rel='manifest' href={`${basePath}/manifest.json`} />
           <link rel='icon' href={`${basePath}/favicon.ico`} />
           <meta name='apple-mobile-web-app-capable' content='yes' />
           <meta name='apple-mobile-web-app-status-bar-style' content='black-translucent' />
           <meta name='viewport' content='width=device-width, initial-scale=1, viewport-fit=cover' />
         </Head>
         <body>
           <Main />
           <NextScript />
         </body>
       </Html>
     )
   }
 }



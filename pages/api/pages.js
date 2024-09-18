import fs from 'fs';
import path from 'path';

const dataFile = path.join(process.cwd(), 'data', 'pages.json');

export default function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const data = fs.readFileSync(dataFile, 'utf8');
      res.status(200).json(JSON.parse(data));
    } catch (error) {
      console.error('Error reading data:', error);
      res.status(500).json({ message: 'Error reading data' });
    }
  } else if (req.method === 'POST') {
    try {
      fs.writeFileSync(dataFile, JSON.stringify(req.body, null, 2));
      res.status(200).json({ message: 'Data saved successfully' });
    } catch (error) {
      console.error('Error saving data:', error);
      res.status(500).json({ message: 'Error saving data' });
    }
  } else {
    res.status(405).json({ message: 'Method not allowed' });
  }
}
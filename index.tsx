import React, { useState, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleGenAI, Type } from "@google/genai";

const App = () => {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    script: '',
    summary: '',
    sceneCount: 3,
    artStyle: 'Cinematic realism, dark moody shadows, 4k',
    characters: '',
    colorMood: 'Default',
    storyboardPrompts: '',
    animationPrompts: '',
    jsonPrompts: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const handleNext = () => setStep(prev => prev + 1);
  const handleBack = () => setStep(prev => prev - 1);
  const handleStartOver = () => {
    setStep(1);
    setFormData({
      script: '',
      summary: '',
      sceneCount: 3,
      artStyle: 'Cinematic realism, dark moody shadows, 4k',
      characters: '',
      colorMood: 'Default',
      storyboardPrompts: '',
      animationPrompts: '',
      jsonPrompts: '',
    });
    setError('');
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file && file.type === 'text/plain') {
      const reader = new FileReader();
      reader.onload = (e) => {
        // FIX: e.target.result is typed as string | ArrayBuffer, but readAsText provides a string. Cast to string to satisfy TypeScript.
        setFormData(prev => ({ ...prev, script: e.target.result as string }));
      };
      reader.readAsText(file);
    } else {
      setError('Please upload a valid .txt file.');
    }
  };

  const callGemini = useCallback(async (prompt, config = {}) => {
    setIsLoading(true);
    setError('');
    try {
      const result = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
          ...config,
      });
      return result.text;
    } catch (e) {
      console.error(e);
      setError(e.message || 'An error occurred while communicating with the AI.');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [ai.models]);

  const handleAnalyzeScript = async () => {
    if (!formData.script.trim()) {
      setError('Script cannot be empty.');
      return;
    }
    const prompt = `Summarize this script in a single, concise sentence, focusing on the main plot or theme:\n\n---\n\n${formData.script}`;
    const summary = await callGemini(prompt);
    if (summary) {
      setFormData(prev => ({ ...prev, summary }));
      handleNext();
    }
  };

  const handleExtractCharacters = async () => {
    const prompt = `Analyze the script below to identify the main characters. For each character found, provide a detailed description including their appearance, personality, and significant traits.

**SCRIPT:**
${formData.script}

**OUTPUT FORMATTING RULES:**
- For each character, use the following format exactly:
Character: [Character Name]
Description: [A paragraph describing the character.]
- Separate each character entry with a blank line.
- If the script contains no identifiable characters, the entire response should be only this exact phrase: "No distinct characters were found in the script."`;
    const characters = await callGemini(prompt);
    if (characters) {
      setFormData(prev => ({ ...prev, characters }));
      handleNext();
    }
  };

  const handleGenerateStoryboard = async () => {
    const prompt = `You are an AI assistant director creating a storyboard. Generate image prompts based on the provided script and constraints.

    **SCRIPT:**
    ${formData.script}
    
    **CONSTRAINTS:**
    1.  **Scenes per Paragraph:** Generate ${formData.sceneCount} distinct image prompts for each major paragraph of the script.
    2.  **Art Style:** ${formData.artStyle}
    3.  **Character Descriptions:**
        ${formData.characters}
    4.  **Color Mood:** ${formData.colorMood}
    
    **OUTPUT FORMAT:**
    -   Start each prompt with "Scene X:"
    -   Each prompt must be a detailed, single-paragraph description suitable for an image generation AI.
    -   Incorporate the art style, character details, and color mood into every prompt.
    `;
    const prompts = await callGemini(prompt, { config: { thinkingConfig: { thinkingBudget: 0 } } });
    if (prompts) {
      setFormData(prev => ({ ...prev, storyboardPrompts: prompts }));
      handleNext();
    }
  };
  
  const handleGenerateAnimation = async () => {
     const prompt = `Convert the following static storyboard prompts into dynamic animation prompts. For each scene, describe camera movements (e.g., pan, zoom in, tracking shot), character actions, and environmental effects.

    **STORYBOARD PROMPTS:**
    ${formData.storyboardPrompts}

    **OUTPUT FORMAT:**
    -   Keep the "Scene X:" numbering.
    -   For each scene, write a new paragraph describing the animation.
    `;
    const prompts = await callGemini(prompt);
    if (prompts) {
      setFormData(prev => ({ ...prev, animationPrompts: prompts }));
      handleNext();
    }
  };

  const handleGenerateJson = async () => {
      const prompt = `Convert these animation prompts into a structured JSON array. Each object in the array represents a scene and must contain 'scene_number' (integer) and 'prompt' (string). Extract the scene number and the full animation prompt text for each.

      **ANIMATION PROMPTS:**
      ${formData.animationPrompts}
      `;
      const schema = {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              scene_number: { type: Type.INTEGER },
              prompt: { type: Type.STRING },
            },
            required: ['scene_number', 'prompt'],
          },
      };

      const jsonResponse = await callGemini(prompt, { config: { responseMimeType: 'application/json', responseSchema: schema } });
      if(jsonResponse) {
          // The response is a string, so we parse and re-stringify for formatting
          const parsed = JSON.parse(jsonResponse);
          setFormData(prev => ({ ...prev, jsonPrompts: JSON.stringify(parsed, null, 2) }));
          handleNext();
      }
  };
  
  const downloadFile = (content, filename, contentType) => {
    const blob = new Blob([content], { type: contentType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
        alert('Copied to clipboard!');
    }, (err) => {
        alert('Failed to copy!');
    });
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <div className="card">
            <div className="step-header">
              <h2>Step 1: Provide Your Script</h2>
              <p>Paste your script directly below or click 'Upload .txt File' to load it from your computer.</p>
            </div>
            {error && <div className="error-message">{error}</div>}
            <textarea
              name="script"
              className="textarea"
              placeholder="In a realm where shadows dance and the moon whispers secrets..."
              value={formData.script}
              onChange={handleChange}
              aria-label="Script Input"
            />
            <div className="button-group">
              <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".txt" style={{ display: 'none' }} />
              <button className="button button-secondary" onClick={() => fileInputRef.current.click()}>Upload .txt File</button>
              <button className="button button-primary" onClick={handleAnalyzeScript} disabled={isLoading || !formData.script.trim()}>
                {isLoading ? <div className="loader" /> : 'Analyze Script'}
              </button>
            </div>
          </div>
        );
      case 2:
        return (
            <div className="card">
                <div className="success-message">
                    <strong>Script Received!</strong> I see this is about: "{formData.summary}"
                </div>
                <div className="step-header">
                    <h2>Step 2: Scene Pacing</h2>
                    <p>How many scenes (or images) should I create from each major paragraph of your script? (1-10)</p>
                </div>
                {error && <div className="error-message">{error}</div>}
                <div className="scene-count-container">
                    <input
                        type="number"
                        name="sceneCount"
                        className="input scene-count-input"
                        min="1"
                        max="10"
                        value={formData.sceneCount}
                        onChange={(e) => setFormData(prev => ({...prev, sceneCount: Math.max(1, Math.min(10, parseInt(e.target.value, 10) || 1))}))}
                        aria-label="Scene Count"
                    />
                </div>
                <div className="button-group">
                    <button className="button button-secondary" onClick={handleBack}>Back</button>
                    <button className="button button-primary" onClick={handleNext}>Set Scene Count</button>
                </div>
            </div>
        );
      case 3:
          return (
              <div className="card">
                  <div className="step-header">
                      <h2>Step 3: Art Style</h2>
                      <p>Describe the visual style for your storyboard. This will guide the AI in generating characters and scenes.</p>
                  </div>
                  {error && <div className="error-message">{error}</div>}
                  <div className="form-group">
                      <label htmlFor="artStyle">Enter Your Art Style</label>
                      <textarea
                          id="artStyle"
                          name="artStyle"
                          className="textarea"
                          style={{minHeight: '100px'}}
                          placeholder="e.g., Cinematic realism, dark moody shadows, 4k..."
                          value={formData.artStyle}
                          onChange={handleChange}
                      />
                      <p style={{color: 'var(--secondary-text)', fontSize: '0.875rem'}}>Be descriptive! You can include details about lighting, quality, and artistic influence.</p>
                  </div>
                  <div className="button-group">
                      <button className="button button-secondary" onClick={handleBack}>Back</button>
                      <button className="button button-primary" onClick={handleExtractCharacters} disabled={isLoading}>
                          {isLoading ? <div className="loader" /> : 'Extract Characters'}
                      </button>
                  </div>
              </div>
          );
      case 4:
        return (
            <div className="card">
                <div className="step-header">
                    <h2>Step 4: Review &amp; Refine</h2>
                    <p>Review the AI-generated characters and set the final color mood.</p>
                </div>
                {error && <div className="error-message">{error}</div>}
                <div className="form-group">
                    <label htmlFor="characters">1. Character List (Editable)</label>
                    <textarea
                        id="characters"
                        name="characters"
                        className="textarea"
                        value={formData.characters}
                        onChange={handleChange}
                    />
                </div>
                <div className="form-group">
                    <label htmlFor="colorMood">2. Color Mood</label>
                    <select id="colorMood" name="colorMood" className="select" value={formData.colorMood} onChange={handleChange}>
                        <option>Default</option>
                        <option>Vibrant and Colorful</option>
                        <option>Dark and Moody</option>
                        <option>Sepia Tone</option>
                        <option>Black and White</option>
                        <option>Pastel</option>
                    </select>
                </div>
                <div className="button-group">
                    <button className="button button-secondary" onClick={handleBack}>Back</button>
                    <button className="button button-primary" onClick={handleGenerateStoryboard} disabled={isLoading}>
                        {isLoading ? <div className="loader" /> : 'Generate Storyboard'}
                    </button>
                </div>
            </div>
        );
      case 5:
        return (
            <div className="card">
                <div className="step-header">
                    <h2>Your Storyboard Prompts Are Ready!</h2>
                    <p>I've created {formData.storyboardPrompts.split('Scene').length - 1} prompts from your script. Here is a preview.</p>
                </div>
                <div className="result-preview">{formData.storyboardPrompts}</div>
                <div className="download-actions">
                    <p>Download Your Full TXT File</p>
                    <div className="button-group" style={{justifyContent: 'center'}}>
                        <button className="button button-secondary" onClick={() => downloadFile(formData.storyboardPrompts, 'storyboard_prompts.txt', 'text/plain')}>Download .txt</button>
                        <button className="button button-secondary" onClick={() => copyToClipboard(formData.storyboardPrompts)}>Copy All Prompts</button>
                    </div>
                </div>
                 <div className="card" style={{marginTop: '1rem'}}>
                    <div className="step-header">
                        <h3>Want to bring your storyboard to life?</h3>
                        <p>Take the next step and convert your prompts for animation.</p>
                    </div>
                     <div className="button-group" style={{justifyContent: 'center'}}>
                        <button className="button button-secondary" onClick={handleBack}>Back</button>
                        <button className="button button-secondary" onClick={handleStartOver}>Start Over</button>
                        <button className="button button-primary" onClick={handleGenerateAnimation} disabled={isLoading}>
                           {isLoading ? <div className="loader" /> : 'Generate Animation Prompts'}
                        </button>
                    </div>
                </div>
            </div>
        );
      case 6:
        return (
            <div className="card">
                <div className="step-header">
                    <h2>Your Animation Prompts Are Ready!</h2>
                    <p>I've converted your storyboard into dynamic animation prompts.</p>
                </div>
                <div className="result-preview">{formData.animationPrompts}</div>
                <div className="download-actions">
                    <p>Download Your Animation Prompts</p>
                    <div className="button-group" style={{justifyContent: 'center'}}>
                        <button className="button button-secondary" onClick={() => downloadFile(formData.animationPrompts, 'animation_prompts.txt', 'text/plain')}>Download .txt</button>
                        <button className="button button-secondary" onClick={() => copyToClipboard(formData.animationPrompts)}>Copy All Prompts</button>
                    </div>
                </div>
                <div className="card" style={{marginTop: '1rem'}}>
                     <div className="step-header">
                        <h3>Final Step: Generate JSON Prompts</h3>
                        <p>This will convert your animation prompts into a structured JSON format, optimized for advanced text-to-video AI models. Would you like to proceed?</p>
                    </div>
                    <div className="button-group">
                        <button className="button button-secondary" onClick={handleBack}>Back to Animation Prompts</button>
                        <div>
                          <button className="button button-danger" style={{marginRight: '1rem'}} onClick={handleStartOver}>No, Start Over</button>
                          <button className="button button-primary" onClick={handleGenerateJson} disabled={isLoading}>
                              {isLoading ? <div className="loader" /> : 'Yes, Generate JSON'}
                          </button>
                        </div>
                    </div>
                </div>
            </div>
        );
        case 7:
        return (
            <div className="card">
                <div className="step-header">
                    <h2>Your JSON Video Prompts Are Ready!</h2>
                    <p>I've generated structured JSON prompts for video AI.</p>
                </div>
                <div className="result-preview">{formData.jsonPrompts}</div>
                <div className="download-actions">
                     <p>Download Your JSON File</p>
                    <button className="button button-primary" onClick={() => downloadFile(formData.jsonPrompts, 'video_prompts.json', 'application/json')}>Download .json</button>
                </div>
                <div className="button-group" style={{justifyContent: 'center'}}>
                    <button className="button button-secondary" onClick={handleBack}>Back</button>
                    <button className="button button-primary" onClick={handleStartOver}>Start Over</button>
                </div>
            </div>
        );
      default:
        return <div>Invalid Step</div>;
    }
  };

  return (
    <div className="app-container">
      <header className="header">
        <h1>PromptShot by Samar Ali Khan</h1>
        <p>Your AI First Assistant Director for YouTube Storyboards</p>
      </header>
      <main>
        {renderStep()}
      </main>
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<React.StrictMode><App /></React.StrictMode>);
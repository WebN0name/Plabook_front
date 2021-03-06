import React, {useContext, useEffect, useState} from 'react'
import Context from '../Context'
import HeaderReadingPage from '../components/HeaderReadingBlock'
import Text from '../components/Text'
import Controls from '../components/Controls'
import axios from 'axios'
import Preloader from '../components/Preloader'
import Modalpermission from '../components/Modalpermission'
import TestButton from '../components/TestButton'
import ModalTest from '../components/ModalTest'

export default function  ReadingPage ({history}){

    const {loaderState, loaderDispatch, bookForReading, bookForReadingDispatch, user, queueState, dispathQueueState} = useContext(Context)

    let frequency = new Uint8Array(32*2)
    let analizer = null

    const[isPermission, setPermission] = useState('wait')
    const[currentFrequency, setFrequency] = useState(0)
    const [currentIndex, setCurrentIndex] = useState(0)
    const [dots, setDots] = useState([])
    const [endTalking, setEndTalking] = useState(true)
    const [isRecord, setIsRecord] = useState(false)
    const [errorPermission, setErrorPermission] = useState({
        error: '',
        text: ''
    })
    const [Recorder, setRecorder] = useState(null)
    const [audio, setAudio] = useState([])
    const [wrongWord, setWrongWord] = useState('')
    const [blockButton, setBlockButton] = useState(false)
    const [isTest, setIsTest] = useState(false)
    const [audioQueue, setAudioQueue] = useState([])
    const [testState, setTestState] = useState([1, 2, 3])
    const [checkState, setCheckState] = useState(false)
    

    useEffect(() => {
        if(!bookForReading){
            history.push('/BookPick')
        }else{
            localStorage.setItem('testQueue', JSON.stringify(false))
            localStorage.setItem('Page', JSON.stringify(0))
            getPermission()
            let allDots = []
            for(let i = 0; i<bookForReading.texts.length; i++){
                let tmp = {
                    id: i
                }

                allDots.push(tmp)
            }
            setDots(allDots)
        }
    }, [])

    async function getPermission(){
        try {
            let stream = null
            stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false})
            const Rec = new MediaRecorder(stream)
            setRecorder(Rec)
            const context = new AudioContext()
            analizer = context.createAnalyser()
            const src = context.createMediaStreamSource(stream)
            src.connect(analizer)
            loop()
            setPermission('success')
        }catch (error) {
            console.log(error)
            setPermission('denied')
        }
    }

    function loop(){
        window.requestAnimationFrame(loop)
        analizer.getByteFrequencyData(frequency)
        setFrequency(frequency[0])
    }

    function getAudioResult(){
        localStorage.setItem('testQueue', JSON.stringify(true))
        const Page = JSON.parse(localStorage.getItem('Page'))
        const finalString = audioQueue[0]
        let tmp = audioQueue
        tmp.shift()
        setAudioQueue(tmp)
        axios.post('https://boomd.ru:3000/saveRecord',{
            textName : bookForReading.name,
            record: finalString
        }).then(r => {
            const id = r.data.result._id
            const httpsClient = axios.create()
            httpsClient.defaults.timeout = 900000
            httpsClient.post('https://boomd.ru:3000/recordCheck',{ 
                text : bookForReading.textsForSale[Page],
                recordId: id,
                username: user,
                textName : bookForReading.name,
                bookPage: Page + 1
            }).then(r => {
                console.log(r)
               const wrongWords = r.data.mlResult
                for(let i=0; i< wrongWords.length; i++){
                    wrongWords[i] = wrongWords[i].split('\'').join('’');
                }
                setAudio(r.data.filesArray)
                let tmp = bookForReading
                let cnt = 0
                console.log(r.data.bookPage)
                for(let i = 0; i < tmp.texts[r.data.bookPage - 1].length; i++){
                    if((tmp.texts[Page][i].isPretext !== true) && (tmp.texts[Page][i].type !== 'symbol')){
                        if(tmp.texts[Page][i].text === wrongWords[cnt]){
                            tmp.texts[Page][i].style = 'wrong'
                            cnt++
                        }else{
                            tmp.texts[Page][i].style = 'right'
                        }
                    }else{
                        tmp.texts[Page][i].style = 'readed'
                    }
                }

                console.log(tmp)

                bookForReadingDispatch({
                    type: 'setBookFroReading',
                    payload: tmp
                })
                localStorage.setItem('testQueue', JSON.stringify(false))
            })
        })
    }

    const nextPage = (value) =>{
        if(endTalking){
            setWrongWord('')
            setCurrentIndex(value + 1)
            localStorage.setItem('Page', JSON.stringify(value + 1)) 
        }
    }

    const previousPage = (value) =>{
        if(endTalking){
            setWrongWord('')
            setCurrentIndex(value - 1)
            localStorage.setItem('Page', JSON.stringify(value - 1))
        }
    }

    function blockRecordButton(){
        setTimeout(() => {
            setBlockButton(false)
        }, 3000);
    }

    function clickRecordButton(isRecord, isPermission, endTalking, ){
        if(((isPermission === 'success') && (endTalking === true) && (blockButton !== true))){
            if(isRecord){
                setIsRecord(false)
                stopRecord()
            }else{
                setBlockButton(true)
                blockRecordButton()
                setIsRecord(true)
                startRecod()
            }
        }else{
            if(isPermission === 'wait'){
                setErrorPermission({
                    error: 'wait',
                    text: 'Please, give the permission for use your microphone.'
                })
            }

            if(isPermission === 'denied'){
                setErrorPermission({
                    error: 'denied',
                    text: 'You have denied permission to use your microphone. Please reload the page and give permission or check the required permission item in the settings for this page.'
                })
            }
        }
    }


    function startRecod(){
        Recorder.start()
    }

    async function stopRecord(){
        Recorder.stop()
        const result = await getResult()
        let voice = []
        voice.push(result)
        const voiceBlob = new Blob(voice, {
            type: 'audio/wav'
        })
        const finalString = await getBinaryString(voiceBlob)
        let tmp = audioQueue
        tmp.push(finalString)
        setAudioQueue(tmp)
        if(checkState === false){
            setCheckState(true)
            checkAudio()
        }
    }

    function checkAudio(){
        setTimeout(() => {
            if((audioQueue.length !==0) && (localStorage.getItem('testQueue') === 'false')){
                localStorage.setItem('testQueue', JSON.stringify(true))
                getAudioResult()
            }
            checkAudio()  
        }, 200);
    }

    function getBinaryString(voiceBlob){
        return new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => {
              resolve(reader.result)
            }
            reader.onerror = reject
            reader.readAsDataURL(voiceBlob)
          })
    }

    function getResult(){
        return new Promise((resolve) => {
            Recorder.ondataavailable = (e) => {
              resolve(e.data)
            }
        })
    }


    function refreshErrors (){
        setErrorPermission({
            error: '',
            text: ''
        })
    }


    function bookPick(){
        history.push('/BookPick')
    }

    const setWrongWordFunc = async (value) => {
        setWrongWord(value)
        const player = new Audio()
        for(let i = 0; i < audio.length; i++){
            if(audio[i].word === value){
                player.src = 'data:audio/wav;base64,' + audio[i].sound
                break
            }
        }

        player.play()
        setEndTalking(false)
        const end = await endTalkingFunc(player)
        if(end.returnValue === true){
            setEndTalking(true)
        }
    }

    function endTalkingFunc(player){
        return new Promise((resolve) => {
            player.onended = function(e){
                resolve(e)
            }
        })
    }

    const OpenTestModal = (value) =>{
        setIsTest(value)
    }

    const SetModalTestClose = (value) =>{
        setIsTest(value)
    }

    const getTestString = ( value ) =>{
        loaderDispatch({
            type: 'isLoading',
        })
        axios.post('https://boomd.ru:3000/saveRecord',{
            textName : bookForReading.name,
            record: value
        }).then(r => {
            const id = r.data.result._id
            axios.post('https://boomd.ru:3000/recordCheck', { 
                text : bookForReading.textsForSale[currentIndex],
                recordId: id,
                username: user,
                textName : bookForReading.name,
                bookPage: currentIndex + 1
            }).then(r => {
                loaderDispatch({
                    type: 'isLoading',
                })
               const wrongWords = r.data.mlResult
                for(let i=0; i< wrongWords.length; i++){
                    wrongWords[i] = wrongWords[i].split('\'').join('’');
                }
                setAudio(r.data.filesArray)
                let tmp = bookForReading
                let cnt = 0
                for(let i = 0; i < tmp.texts[currentIndex].length; i++){
                    if((tmp.texts[currentIndex][i].isPretext !== true) && (tmp.texts[currentIndex][i].type !== 'symbol')){
                        if(tmp.texts[currentIndex][i].text === wrongWords[cnt]){
                            tmp.texts[currentIndex][i].style = 'wrong'
                            cnt++
                        }else{
                            tmp.texts[currentIndex][i].style = 'right'
                        }
                    }else{
                        tmp.texts[currentIndex][i].style = 'readed'
                    }
                }

                bookForReadingDispatch({
                    type: 'setBookFroReading',
                    payload: tmp
                })
            })
        })
    }

    if(bookForReading){
        return (
            <>
            <Preloader loader = {loaderState}/>
            <Modalpermission errorPermission = {errorPermission} refreshErrors = {refreshErrors}/>
            <TestButton OpenTestModal = { OpenTestModal }/>
            <ModalTest isTest = { isTest } SetModalTestClose = { SetModalTestClose } getTestString = { getTestString }/>
            <div className="ReadingPageContainer">
                <HeaderReadingPage bookImage = {bookForReading.image} bookPick = { bookPick } wrongWord = { wrongWord }/>
                <Text pages = { bookForReading.texts } index = { currentIndex } nextPage = { nextPage } previousPage = { previousPage } setWrongWord = { setWrongWordFunc }/>
                <Controls 
                dots = { dots } 
                index = {currentIndex} 
                clickRecordButton = { () => clickRecordButton(isRecord, isPermission, endTalking)}
                frequency = { currentFrequency }
                isRecord = {isRecord}
                />
            </div>
            {String(localStorage.getItem('testQueue'))}
            </>
        )
    }else{
        history.push('/BookPick')
        return null
    }
}

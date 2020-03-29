import Message from './Message';

export default interface MessageListener {
  newMessage(msg: Message): void;
}